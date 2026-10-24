import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { fetchFinnhubQuote } from './finnhub.ts'
import { getCurrentQuoteCaptureSession, type XnysSession } from './xnys-calendar.ts'

type Payload = { positions: Record<string, unknown>[]; manualAssets: Record<string, unknown>[]; liabilities: Record<string, unknown>[] }
export type SnapshotResult =
  | { kind: 'ready'; session: XnysSession; positionCount: number; manualAssetCount: number; liabilityCount: number }
  | { kind: 'already_recorded'; snapshotId: string }
  | { kind: 'unavailable'; reason: 'no_session' | 'outside_capture_window' | 'state_changed_after_close' | 'price_unavailable' | 'no_eligible_facts' }

const decimal = (value: unknown) => String(value)
const after = (value: unknown, instant: string) => typeof value === 'string' && Date.parse(value) > Date.parse(instant)

async function build(admin: SupabaseClient, userId: string, portfolioId: string, apiKey: string): Promise<{ result: SnapshotResult; payload?: Payload }> {
  const session = getCurrentQuoteCaptureSession()
  if (session.kind !== 'session') return { result: { kind: 'unavailable', reason: session.reason === 'outside_coverage' ? 'outside_capture_window' : 'no_session' } }
  const [existingResult, accountsResult, positionsResult, assetsResult, liabilitiesResult] = await Promise.all([
    admin.from('portfolio_snapshots').select('id').eq('portfolio_id', portfolioId).eq('user_id', userId).eq('market_close_at', session.marketCloseAt).is('corrects_snapshot_id', null).maybeSingle(),
    admin.from('accounts').select('id, name, updated_at').eq('portfolio_id', portfolioId).eq('user_id', userId),
    admin.from('positions').select('id, account_id, symbol, security_name, asset_type, quantity, average_cost, updated_at, last_event_at').eq('portfolio_id', portfolioId).eq('user_id', userId).eq('status', 'open'),
    admin.from('manual_assets').select('id, account_id, name, category, current_value, include_in_net_worth, currency_code, value_as_of, updated_at').eq('portfolio_id', portfolioId).eq('user_id', userId),
    admin.from('liabilities').select('id, account_id, name, category, outstanding_balance, include_in_net_worth, currency_code, balance_as_of, updated_at').eq('portfolio_id', portfolioId).eq('user_id', userId),
  ])
  if (existingResult.error || accountsResult.error || positionsResult.error || assetsResult.error || liabilitiesResult.error) throw new Error('Snapshot storage unavailable')
  if (existingResult.data) return { result: { kind: 'already_recorded', snapshotId: existingResult.data.id } }
  const accounts = accountsResult.data ?? []; const positions = positionsResult.data ?? []; const assets = assetsResult.data ?? []; const liabilities = liabilitiesResult.data ?? []
  if (!positions.length && !assets.length && !liabilities.length) return { result: { kind: 'unavailable', reason: 'no_eligible_facts' } }
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const changed = positions.some((p) => after(p.updated_at, session.marketCloseAt) || after(p.last_event_at, session.marketCloseAt) || after(accountById.get(p.account_id)?.updated_at, session.marketCloseAt))
    || assets.some((a) => after(a.updated_at, session.marketCloseAt) || after(a.value_as_of, session.marketCloseAt) || (a.account_id && after(accountById.get(a.account_id)?.updated_at, session.marketCloseAt)))
    || liabilities.some((l) => after(l.updated_at, session.marketCloseAt) || after(l.balance_as_of, session.marketCloseAt) || (l.account_id && after(accountById.get(l.account_id)?.updated_at, session.marketCloseAt)))
  if (changed) return { result: { kind: 'unavailable', reason: 'state_changed_after_close' } }
  const priced = await Promise.all(positions.map(async (position) => ({ position, quote: await fetchFinnhubQuote(position.symbol, apiKey) })))
  if (priced.some(({ quote }) => quote.kind !== 'quote')) return { result: { kind: 'unavailable', reason: 'price_unavailable' } }
  const snapshotPositions = priced.map(({ position, quote }) => {
    if (quote.kind !== 'quote') throw new Error('Price unavailable')
    const account = accountById.get(position.account_id)
    if (!account) throw new Error('Snapshot storage unavailable')
    return { source_position_id: position.id, account_label: account.name, symbol: position.symbol, security_name: position.security_name, asset_type: position.asset_type, quantity: decimal(position.quantity), average_cost: decimal(position.average_cost), market_price: quote.price, price_at: session.marketCloseAt, price_source: 'finnhub current quote after XNYS close', price_kind: 'current_quote_close' }
  })
  return {
    result: { kind: 'ready', session, positionCount: snapshotPositions.length, manualAssetCount: assets.length, liabilityCount: liabilities.length },
    payload: {
      positions: snapshotPositions,
      manualAssets: assets.map((a) => ({ source_manual_asset_id: a.id, name: a.name, category: a.category, account_label: a.account_id ? accountById.get(a.account_id)?.name ?? null : null, value: decimal(a.current_value), include_in_net_worth: a.include_in_net_worth, currency_code: a.currency_code, effective_at: a.value_as_of })),
      liabilities: liabilities.map((l) => ({ source_liability_id: l.id, name: l.name, category: l.category, account_label: l.account_id ? accountById.get(l.account_id)?.name ?? null : null, balance: decimal(l.outstanding_balance), include_in_net_worth: l.include_in_net_worth, currency_code: l.currency_code, effective_at: l.balance_as_of })),
    },
  }
}

export async function previewSnapshot(admin: SupabaseClient, userId: string, portfolioId: string, apiKey: string) { return (await build(admin, userId, portfolioId, apiKey)).result }

export async function saveSnapshot(admin: SupabaseClient, userClient: SupabaseClient, userId: string, portfolioId: string, requestId: string, apiKey: string) {
  const built = await build(admin, userId, portfolioId, apiKey)
  if (built.result.kind !== 'ready' || !built.payload) return built.result
  const { data, error } = await userClient.rpc('create_portfolio_snapshot', { p_portfolio_id: portfolioId, p_as_of_date: built.result.session.asOfDate, p_market_close_at: built.result.session.marketCloseAt, p_source: 'manual', p_positions: built.payload.positions, p_manual_assets: built.payload.manualAssets, p_liabilities: built.payload.liabilities, p_request_id: requestId })
  if (error) {
    if (error.code === '22000') return { kind: 'already_recorded', snapshotId: '' } as const
    throw new Error('Snapshot save unavailable')
  }
  return { kind: 'saved' as const, snapshotId: String(data), session: built.result.session }
}
