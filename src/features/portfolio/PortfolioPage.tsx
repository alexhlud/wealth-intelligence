import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { accountInputSchema, accountResponseSchema, openPositionResponseSchema, portfolioResponseSchema, validationErrorMessage } from '@/lib/validation'
import type { AccountInput, AccountResponse, OpenPositionResponse, PortfolioResponse } from '@/lib/validation'
import { supabase } from '@/lib/supabase'
import { formatUsd, HARDCODED_USD_PRICE_BY_SYMBOL, marketValue, percentageOf, sumDecimals } from './prices'
import { reconcileAccountSelection } from './accountSelection'
import { PositionDialog } from './PositionDialog'

async function getPortfolio(): Promise<PortfolioResponse> { const { data, error } = await supabase.from('portfolios').select('id, name').eq('is_primary', true).limit(1); if (error) throw error; const portfolio = portfolioResponseSchema.parse(data)[0]; if (!portfolio) throw new Error('Portfolio unavailable'); return portfolio }
async function getAccounts(id: string): Promise<AccountResponse[]> { const { data, error } = await supabase.from('accounts').select('id, portfolio_id, name, institution_name, account_type, include_in_net_worth').eq('portfolio_id', id).order('created_at'); if (error) throw error; return accountResponseSchema.parse(data) }
async function getPositions(id: string): Promise<OpenPositionResponse[]> { const { data, error } = await supabase.from('positions').select('id, account_id, symbol, security_name, asset_type, status, quantity, average_cost').eq('portfolio_id', id).eq('status', 'open').order('created_at'); if (error) throw error; return openPositionResponseSchema.parse(data) }
function usePortfolioData() { const portfolio = useQuery({ queryKey: ['primary-portfolio'], queryFn: getPortfolio }); const accounts = useQuery({ queryKey: ['accounts', portfolio.data?.id], queryFn: () => getAccounts(portfolio.data!.id), enabled: Boolean(portfolio.data) }); const positions = useQuery({ queryKey: ['open-positions', portfolio.data?.id], queryFn: () => getPositions(portfolio.data!.id), enabled: Boolean(portfolio.data) }); return { portfolio, accounts, positions } }

function AccountSelection({ accounts, selected, setSelected }: { accounts: AccountResponse[]; selected: Set<string>; setSelected: (value: Set<string>) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const label = selected.size === accounts.length ? 'All accounts' : selected.size === 0 ? 'No accounts' : `${selected.size} account${selected.size === 1 ? '' : 's'} selected`
  const toggle = (id: string) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next) }
  const closeAndRestoreFocus = useCallback(() => { setIsOpen(false); triggerRef.current?.focus() }, [])
  useEffect(() => {
    if (!isOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) closeAndRestoreFocus() }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); closeAndRestoreFocus() } }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOnOutsidePointer); window.removeEventListener('keydown', closeOnEscape) }
  }, [closeAndRestoreFocus, isOpen])
  return <div className="account-selector" ref={rootRef}><button ref={triggerRef} className="selector-trigger" type="button" aria-label={`Account selection: ${label}`} aria-expanded={isOpen} aria-controls="account-selection-panel" onClick={() => setIsOpen((open) => !open)}>{label}</button>{isOpen && <div className="selector-panel" id="account-selection-panel"><div className="selector-actions"><Button className="button-text" onClick={() => setSelected(new Set(accounts.map(({ id }) => id)))}>Select all</Button><Button className="button-text" onClick={() => setSelected(new Set())}>Clear all</Button></div>{accounts.map((account) => <label className="checkbox-row" key={account.id}><input type="checkbox" checked={selected.has(account.id)} onChange={() => toggle(account.id)} />{account.name}<span>{account.account_type.replace('_', ' ')}</span></label>)}<p className="selection-announcement" aria-live="polite">{label} shown.</p></div>}</div>
}

export function HoldingsPage() {
  const { portfolio, accounts, positions } = usePortfolioData(); const [selected, setSelected] = useState<Set<string> | null>(null); const [editing, setEditing] = useState<OpenPositionResponse | null | undefined>(undefined)
  const selectionStorageKey = portfolio.data ? `holding-account-selection:${portfolio.data.id}` : null
  const persistSelected = (next: Set<string>) => { if (selectionStorageKey) sessionStorage.setItem(selectionStorageKey, JSON.stringify([...next])); setSelected(next) }
  useEffect(() => {
    if (!accounts.data || !selectionStorageKey) return
    const accountIds = accounts.data.map(({ id }) => id)
    let storedIds: string[] | null = null
    const saved = sessionStorage.getItem(selectionStorageKey)
    if (saved) {
      try { const parsed: unknown = JSON.parse(saved); if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) storedIds = parsed } catch { storedIds = null }
    }
    const reconciled = reconcileAccountSelection(storedIds, accountIds)
    if (selected === null || selected.size !== reconciled.size || [...selected].some((id) => !reconciled.has(id))) setSelected(reconciled)
    sessionStorage.setItem(selectionStorageKey, JSON.stringify([...reconciled]))
  }, [accounts.data, selected, selectionStorageKey])
  if (portfolio.isPending || accounts.isPending || positions.isPending || selected === null) return <LoadingState>Loading your holdings…</LoadingState>
  if (portfolio.isError || accounts.isError || positions.isError) return <ErrorState onRetry={() => { void portfolio.refetch(); void accounts.refetch(); void positions.refetch() }} />
  const accountList = accounts.data ?? []; if (!accountList.length) return <section className="page-header"><h1>Holdings, stated plainly.</h1><EmptyState>Add an account before you record its holdings.</EmptyState><a className="button button-primary" href="/accounts">Go to accounts</a></section>
  const visible = (positions.data ?? []).filter((position) => selected.has(position.account_id)); const values = visible.flatMap((position) => { const price = HARDCODED_USD_PRICE_BY_SYMBOL[position.symbol]; return price ? [marketValue(position.quantity, price)] : [] }); const total = sumDecimals(values)
  const unavailablePriceCount = visible.filter(({ symbol }) => !HARDCODED_USD_PRICE_BY_SYMBOL[symbol]).length
  const positionCount = visible.length; const accountCount = selected.size; const countLabel = `${positionCount} open position${positionCount === 1 ? '' : 's'} / ${accountCount} selected account${accountCount === 1 ? '' : 's'}`
  return <section><header className="page-header"><div><h1>Holdings, stated plainly.</h1><p>{portfolio.data?.name}</p></div><div className="holdings-header-actions"><p className="holdings-context">{countLabel}</p><Button className="button-primary" onClick={() => setEditing(null)}><Plus size={16} /> Add position</Button></div></header><div className="holdings-summary"><div><p>Selected holdings value</p><strong>{formatUsd(total)}</strong>{unavailablePriceCount > 0 && <p className="incomplete-total-notice" role="status">{unavailablePriceCount} holding{unavailablePriceCount === 1 ? '' : 's'} excluded, price unavailable.</p>}</div><p className="day-change-unavailable">Day change unavailable<br /><span>Quotes arrive in Phase 4.</span></p><AccountSelection accounts={accountList} selected={selected} setSelected={persistSelected} /></div>{positions.isFetching && <p className="refetch-copy" role="status">Refreshing holdings…</p>}<div className="table-wrap"><table className="data-table"><thead><tr><th>Security</th><th>Shares</th><th>Average cost</th><th>Price</th><th>Day</th><th>Market value</th><th>Allocation</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{visible.map((position) => { const price = HARDCODED_USD_PRICE_BY_SYMBOL[position.symbol]; const value = price ? marketValue(position.quantity, price) : null; const account = accountList.find(({ id }) => id === position.account_id); return <tr key={position.id}><td><strong>{position.security_name}</strong><small>{position.symbol} · {account?.name ?? 'Account unavailable'}</small></td><td>{position.quantity}</td><td>{formatUsd(position.average_cost)}</td><td>{price ? `${formatUsd(price)} fixed` : 'Unavailable'}</td><td><span className="unavailable-measurement">Unavailable<span className="sr-only">: quotes arrive in Phase 4</span></span></td><td>{value ? formatUsd(value) : 'Unavailable'}</td><td>{value ? percentageOf(value, total) ?? 'Unavailable' : 'Unavailable'}</td><td><Button className="button-text" onClick={() => setEditing(position)}>Edit</Button></td></tr>})}</tbody></table></div>{visible.length === 0 && <EmptyState>{selected.size ? 'No open positions belong to the selected accounts.' : 'Select at least one account to inspect its holdings.'}</EmptyState>}<p className="temporary-price">Temporary display source: QQQ $500.00 and VOO $600.00 fixed prices. Current quotes arrive in Phase 4.</p>{editing !== undefined && portfolio.data && <PositionDialog portfolioId={portfolio.data.id} accounts={accountList} position={editing ?? undefined} onClose={() => setEditing(undefined)} />}</section>
}

function AccountDialog({ account, portfolioId, onClose }: { account?: AccountResponse; portfolioId: string; onClose: () => void }) {
  const client = useQueryClient(); const [form, setForm] = useState<AccountInput>({ name: account?.name ?? '', institutionName: account?.institution_name ?? null, accountType: account?.account_type ?? 'brokerage', includeInNetWorth: account?.include_in_net_worth ?? true }); const [error, setError] = useState<string | null>(null)
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape) }, [onClose])
  const save = useMutation({ mutationFn: async (input: AccountInput) => { const values = { name: input.name, institution_name: input.institutionName, account_type: input.accountType, include_in_net_worth: input.includeInNetWorth }; const result = account ? await supabase.from('accounts').update(values).eq('id', account.id) : await supabase.from('accounts').insert({ ...values, portfolio_id: portfolioId }); if (result.error) throw result.error }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['accounts', portfolioId] }); onClose() }, onError: () => setError('We couldn’t save this account. Please try again.') })
  function submit(event: FormEvent) { event.preventDefault(); const parsed = accountInputSchema.safeParse(form); if (!parsed.success) { setError(validationErrorMessage('account', parsed.error)); return } setError(null); save.mutate(parsed.data) }
  return <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"><button className="dialog-close" onClick={onClose} aria-label="Close account form"><X size={18} /></button><h2 id="account-dialog-title">{account ? 'Edit account' : 'Add account'}</h2><form className="account-form" onSubmit={submit} noValidate><label>Account name<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Institution <span>(optional)</span><input value={form.institutionName ?? ''} onChange={(event) => setForm({ ...form, institutionName: event.target.value || null })} /></label><label>Account type<select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value as AccountInput['accountType'] })}><option value="brokerage">Brokerage</option><option value="retirement">Retirement</option><option value="savings">Savings</option><option value="cash">Cash</option><option value="crypto_wallet">Crypto wallet</option><option value="other">Other</option></select></label><label className="checkbox-row"><input type="checkbox" checked={form.includeInNetWorth} onChange={(event) => setForm({ ...form, includeInNetWorth: event.target.checked })} /> Include in net worth</label>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><Button className="button-secondary" type="button" onClick={onClose}>Cancel</Button><Button className="button-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save account'}</Button></div></form></section></div>
}

export function AccountsPage() {
  const { portfolio, accounts, positions } = usePortfolioData(); const [editing, setEditing] = useState<AccountResponse | null | undefined>(undefined)
  if (portfolio.isPending || accounts.isPending || positions.isPending) return <LoadingState>Loading your accounts…</LoadingState>
  if (portfolio.isError || accounts.isError || positions.isError) return <ErrorState onRetry={() => { void portfolio.refetch(); void accounts.refetch(); void positions.refetch() }} />
  const accountList = accounts.data ?? []; const positionList = positions.data ?? []
  return <section><header className="page-header"><div><h1>Accounts, clearly held.</h1><p>Containers for the positions you inspect.</p></div><Button className="button-primary" onClick={() => setEditing(null)}><Plus size={16} /> Add account</Button></header>{accountList.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Account</th><th>Institution</th><th>Type</th><th>Included</th><th>Positions</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{accountList.map((account) => <tr key={account.id}><td><strong>{account.name}</strong></td><td>{account.institution_name ?? '—'}</td><td>{account.account_type.replace('_', ' ')}</td><td>{account.include_in_net_worth ? 'Included' : 'Excluded'}</td><td>{positionList.filter(({ account_id }) => account_id === account.id).length}</td><td><Button className="button-text" onClick={() => setEditing(account)}>Edit</Button></td></tr>)}</tbody></table></div> : <EmptyState>Add the account that holds your first investment.</EmptyState>}{editing !== undefined && portfolio.data && <AccountDialog account={editing ?? undefined} portfolioId={portfolio.data.id} onClose={() => setEditing(undefined)} />}</section>
}
