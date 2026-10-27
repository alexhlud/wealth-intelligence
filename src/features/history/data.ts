import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { subtractDecimals } from '@/features/portfolio/prices'

export const decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/)
export const snapshotSchema = z.object({
  id: z.string().uuid(), as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  market_close_at: z.string().min(1), total_net_worth: decimal, created_at: z.string().min(1), source: z.string(),
})
export const snapshotsSchema = z.array(snapshotSchema)
export type RecordedSnapshot = z.infer<typeof snapshotSchema>

export type RecordedSnapshotDetailContractIssue = {
  path: string
  code: string
  rule: string
}

export class RecordedSnapshotDetailContractError extends Error {
  readonly issues: readonly RecordedSnapshotDetailContractIssue[]

  constructor(issues: readonly RecordedSnapshotDetailContractIssue[]) {
    super('Recorded snapshot detail did not match the expected contract')
    this.name = 'RecordedSnapshotDetailContractError'
    this.issues = issues
  }
}

const positionSchema = z.object({ source_position_id: z.string().uuid().nullable(), account_label: z.string(), symbol: z.string(), security_name: z.string(), asset_type: z.string(), quantity: decimal, average_cost: decimal, market_price: decimal, price_at: z.string().min(1), market_value: decimal, cost_basis: decimal, unrealized_gain: decimal, portfolio_weight: decimal, price_source: z.string(), price_kind: z.string() })
const manualAssetSchema = z.object({ source_manual_asset_id: z.string().uuid().nullable(), name: z.string(), category: z.string(), account_label: z.string().nullable(), value: decimal, include_in_net_worth: z.boolean(), effective_at: z.string().min(1) })
const liabilitySchema = z.object({ source_liability_id: z.string().uuid().nullable(), name: z.string(), category: z.string(), account_label: z.string().nullable(), value: decimal, include_in_net_worth: z.boolean(), effective_at: z.string().min(1) })
const detailSchema = z.object({
  snapshot: snapshotSchema.extend({ investment_value: decimal, manual_asset_value: decimal, liability_value: decimal, exchange_mic: z.string(), exchange_timezone: z.string() }),
  positions: z.array(positionSchema), manual_assets: z.array(manualAssetSchema), liabilities: z.array(liabilitySchema),
})
export type RecordedSnapshotDetail = z.infer<typeof detailSchema>

export type Period = '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'
export const periods: Period[] = ['1M', '3M', '6M', '1Y', 'YTD', 'ALL']

export function rangeStart(period: Period, latest: string): string | null {
  if (period === 'ALL') return null
  const [year, month, day] = latest.split('-').map(Number)
  if (period === 'YTD') return `${year}-01-01`
  const months = period === '1M' ? 1 : period === '3M' ? 3 : period === '6M' ? 6 : 12
  return new Date(Date.UTC(year, month - 1 - months, day)).toISOString().slice(0, 10)
}

export async function loadHistory(portfolioId: string, startDate: string | null) {
  const { data, error } = await supabase.rpc('list_recorded_snapshot_history', { p_portfolio_id: portfolioId, p_start_date: startDate })
  if (error) throw error
  const parsed = snapshotsSchema.safeParse(data)
  if (!parsed.success) throw new Error('Recorded history is unavailable')
  return parsed.data
}

export async function loadSnapshotDetail(portfolioId: string, snapshotId: string) {
  const { data, error } = await supabase.rpc('get_recorded_snapshot_detail', { p_portfolio_id: portfolioId, p_snapshot_id: snapshotId })
  if (error) throw error
  const parsed = detailSchema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join('.') || '(root)', code: issue.code, rule: issue.message }))
    if (import.meta.env.DEV) console.error('Recorded snapshot detail contract validation failed.', { issues })
    throw new RecordedSnapshotDetailContractError(issues)
  }
  return parsed.data
}

export function dateLabel(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' }).format(new Date(`${value}T12:00:00Z`)) }

export type HoldingChangeKind = 'added' | 'removed' | 'increased' | 'reduced' | 'unchanged'
export type RecordedHoldingChange = {
  key: string
  kind: HoldingChangeKind
  earlier: RecordedSnapshotDetail['positions'][number] | null
  later: RecordedSnapshotDetail['positions'][number] | null
  quantityChange: string | null
  valueChange: string | null
  allocationPointChange: string | null
}

function compareDecimals(left: string, right: string) {
  const difference = subtractDecimals(left, right)
  return difference === '0' ? 0 : difference.startsWith('-') ? -1 : 1
}

function holdingKey(position: RecordedSnapshotDetail['positions'][number]) {
  return `${position.account_label}\u0000${position.symbol}\u0000${position.security_name}`
}

/** Joins immutable snapshot facts; it never substitutes current holdings or prices. */
export function compareRecordedHoldings(earlier: RecordedSnapshotDetail, later: RecordedSnapshotDetail): RecordedHoldingChange[] {
  const earlierByKey = new Map(earlier.positions.map((position) => [holdingKey(position), position]))
  const laterByKey = new Map(later.positions.map((position) => [holdingKey(position), position]))
  return [...new Set([...earlierByKey.keys(), ...laterByKey.keys()])].map((key) => {
    const before = earlierByKey.get(key) ?? null
    const after = laterByKey.get(key) ?? null
    const direction = before && after ? compareDecimals(after.quantity, before.quantity) : 0
    return {
      key,
      kind: !before ? 'added' : !after ? 'removed' : direction > 0 ? 'increased' : direction < 0 ? 'reduced' : 'unchanged',
      earlier: before,
      later: after,
      quantityChange: before && after ? subtractDecimals(after.quantity, before.quantity) : null,
      valueChange: before && after ? subtractDecimals(after.market_value, before.market_value) : null,
      allocationPointChange: before && after ? subtractDecimals(after.portfolio_weight, before.portfolio_weight) : null,
    }
  })
}

export type RecordedValueChange = { key: string; name: string; category: string; accountLabel: string | null; earlier: string | null; later: string | null; change: string | null }
type RecordedValue = { name: string; category: string; account_label: string | null; value: string }

function valueKey(item: RecordedValue) { return `${item.account_label ?? ''}\u0000${item.category}\u0000${item.name}` }

export function compareRecordedValues(earlier: readonly RecordedValue[], later: readonly RecordedValue[]): RecordedValueChange[] {
  const earlierByKey = new Map(earlier.map((item) => [valueKey(item), item]))
  const laterByKey = new Map(later.map((item) => [valueKey(item), item]))
  return [...new Set([...earlierByKey.keys(), ...laterByKey.keys()])].map((key) => {
    const before = earlierByKey.get(key)
    const after = laterByKey.get(key)
    const item = after ?? before!
    return { key, name: item.name, category: item.category, accountLabel: item.account_label, earlier: before?.value ?? null, later: after?.value ?? null, change: before && after ? subtractDecimals(after.value, before.value) : null }
  })
}
