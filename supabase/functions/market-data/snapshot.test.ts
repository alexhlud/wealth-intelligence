import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSnapshot } from './snapshot.ts'

const { fetchFinnhubQuote } = vi.hoisted(() => ({ fetchFinnhubQuote: vi.fn() }))
vi.mock('./finnhub.ts', () => ({ fetchFinnhubQuote }))

// Friday 2026-11-20 is a full session. EST: open 14:30Z, close 21:00Z.
const now = '2026-11-20T22:00:00.000Z'
const close = '2026-11-20T21:00:00.000Z'
const beforeClose = '2026-11-20T15:00:00.000Z'
const accountId = '22222222-2222-4222-8222-222222222222'

type Rows = Record<string, unknown[]>

/** Fake admin client: each table resolves to its rows; filters are recorded. */
function fakeAdmin(rows: Rows) {
  const orFilters: string[] = []
  const admin = {
    from(table: string) {
      const result = { data: rows[table] ?? [], error: null }
      const builder = Object.assign(Promise.resolve(result), {} as Record<string, unknown>)
      for (const method of ['select', 'eq', 'is']) {
        builder[method] = () => builder
      }
      builder.or = (filter: string) => {
        orFilters.push(filter)
        return builder
      }
      builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
      return builder
    },
  }
  return { admin: admin as unknown as SupabaseClient, orFilters }
}

function position(extra: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    account_id: accountId,
    symbol: 'QQQ',
    security_name: 'Invesco QQQ',
    asset_type: 'etf',
    status: 'open',
    quantity: '2',
    average_cost: '400',
    updated_at: beforeClose,
    last_event_at: beforeClose,
    closed_at: null,
    ...extra,
  }
}

function rowsWith(positions: unknown[]): Rows {
  return {
    accounts: [{ id: accountId, name: 'Taxable', updated_at: beforeClose }],
    positions,
    manual_assets: [],
    liabilities: [],
  }
}

function quoteAt(marketTimestamp: string) {
  return {
    kind: 'quote',
    price: '500',
    previousClose: '499',
    change: '1',
    changePercent: '0.2',
    marketTimestamp,
  }
}

async function build(rows: Rows) {
  const { admin, orFilters } = fakeAdmin(rows)
  const built = await buildSnapshot(admin, 'user', 'portfolio', 'key')
  return { result: built.result, orFilters }
}

describe('buildSnapshot after-close check for closed positions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(now))
    fetchFinnhubQuote.mockResolvedValue(quoteAt('2026-11-20T20:59:59.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    fetchFinnhubQuote.mockReset()
  })

  it('reads open positions plus positions closed after the close', async () => {
    const { orFilters } = await build(rowsWith([position()]))
    expect(orFilters).toEqual([`status.eq.open,closed_at.gt."${close}"`])
  })

  it('marks state changed when a held position closed one minute after the close', async () => {
    const closedAfter = position({
      status: 'closed',
      quantity: '0',
      closed_at: '2026-11-20T21:01:00.000Z',
      updated_at: beforeClose,
      last_event_at: beforeClose,
    })
    const { result } = await build(rowsWith([position(), closedAfter]))
    expect(result).toEqual({ kind: 'unavailable', reason: 'state_changed_after_close' })
    expect(fetchFinnhubQuote).not.toHaveBeenCalled()
  })

  it('captures when no position closed after the close', async () => {
    // A position closed a minute before the close is not returned by the
    // database filter above, so only the open position arrives.
    const { result } = await build(rowsWith([position()]))
    expect(result.kind).toBe('ready')
  })
})

describe('buildSnapshot stale quote rule', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(now))
  })

  afterEach(() => {
    vi.useRealTimers()
    fetchFinnhubQuote.mockReset()
  })

  it('makes capture unavailable for a quote from the previous session', async () => {
    fetchFinnhubQuote.mockResolvedValue(quoteAt('2026-11-19T21:00:00.000Z'))
    const { result } = await build(rowsWith([position()]))
    expect(result).toEqual({ kind: 'unavailable', reason: 'price_unavailable' })
  })

  it('makes capture unavailable for a quote one second before the open', async () => {
    fetchFinnhubQuote.mockResolvedValue(quoteAt('2026-11-20T14:29:59.000Z'))
    const { result } = await build(rowsWith([position()]))
    expect(result).toEqual({ kind: 'unavailable', reason: 'price_unavailable' })
  })

  it('accepts a closing print stamped 15:59:59 New York time', async () => {
    fetchFinnhubQuote.mockResolvedValue(quoteAt('2026-11-20T20:59:59.000Z'))
    const { result } = await build(rowsWith([position()]))
    expect(result.kind).toBe('ready')
  })

  it('accepts a thin symbol whose last trade was at the open', async () => {
    fetchFinnhubQuote.mockResolvedValue(quoteAt('2026-11-20T14:30:00.000Z'))
    const { result } = await build(rowsWith([position()]))
    expect(result.kind).toBe('ready')
  })
})
