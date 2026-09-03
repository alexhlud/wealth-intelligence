import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 500
const tables = [
  'profiles', 'portfolios', 'accounts', 'positions', 'position_events', 'manual_assets', 'liabilities',
  'portfolio_snapshots', 'snapshot_positions', 'snapshot_manual_assets', 'snapshot_liabilities',
] as const
type ExportTable = typeof tables[number]
type QueryClient = Pick<typeof supabase, 'from'>

const rowSchema = z.object({ id: z.string().uuid() }).passthrough()
const profileSchema = z.object({ id: z.string().uuid() }).passthrough()
const numericColumns: Record<ExportTable, readonly string[]> = {
  profiles: [], portfolios: [], accounts: [],
  positions: ['quantity', 'average_cost'],
  position_events: ['previous_quantity', 'new_quantity', 'quantity_delta', 'previous_average_cost', 'new_average_cost', 'split_numerator', 'split_denominator', 'dividend_amount'],
  manual_assets: ['current_value'], liabilities: ['outstanding_balance'],
  portfolio_snapshots: ['investment_value', 'cost_basis', 'unrealized_gain', 'cash_value', 'manual_asset_value', 'liability_value', 'total_net_worth'],
  snapshot_positions: ['quantity', 'average_cost', 'market_price', 'market_value', 'cost_basis', 'unrealized_gain', 'unrealized_gain_percent', 'portfolio_weight'],
  snapshot_manual_assets: ['value'], snapshot_liabilities: ['balance'],
}

function decimalString(value: unknown) {
  if (typeof value === 'string' && /^(?:-?)(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return value
  if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) return String(value)
  throw new Error('The recovery export could not be verified.')
}

function validateRows(table: ExportTable, value: unknown) {
  try {
    const rows = z.array(table === 'profiles' ? profileSchema : rowSchema).parse(value)
    return rows.map((row) => {
      const normalized: Record<string, unknown> = { ...row }
      for (const column of numericColumns[table]) {
        if (normalized[column] !== null && normalized[column] !== undefined) normalized[column] = decimalString(normalized[column])
      }
      return normalized
    })
  } catch { throw new Error('The recovery export could not be verified.') }
}

async function readAll(client: QueryClient, table: ExportTable) {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from(table).select('*').order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1)
    if (error || !data) throw new Error('The recovery export could not be completed.')
    const page = validateRows(table, data)
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

export async function createRecoveryExport(client: QueryClient = supabase) {
  const entries = await Promise.all(tables.map(async (table) => [table, await readAll(client, table)] as const))
  return {
    export_version: 1,
    schema_version: 'phase-mfa-3',
    generated_at: new Date().toISOString(),
    collections: Object.fromEntries(entries),
  }
}

export async function downloadRecoveryExport(client: QueryClient = supabase) {
  const content = JSON.stringify(await createRecoveryExport(client), null, 2)
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = `wealth-intelligence-recovery-export-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
  } finally { URL.revokeObjectURL(url) }
}

const reminderKey = 'wealth-intelligence.recovery-export-reminder-day'
const lastExportKey = 'wealth-intelligence.recovery-export-last-download'
export function getRecoveryReminderDay() { const value = Number(localStorage.getItem(reminderKey)); return Number.isInteger(value) && value >= 1 && value <= 28 ? value : 1 }
export function setRecoveryReminderDay(day: number) { localStorage.setItem(reminderKey, String(z.number().int().min(1).max(28).parse(day))) }
export function markRecoveryExportDownloaded() { localStorage.setItem(lastExportKey, new Date().toISOString()) }
export function isRecoveryReminderDue(day = getRecoveryReminderDay()) { const now = new Date(); if (now.getDate() < day) return false; const previous = localStorage.getItem(lastExportKey); return !previous || new Date(previous).getMonth() !== now.getMonth() || new Date(previous).getFullYear() !== now.getFullYear() }
