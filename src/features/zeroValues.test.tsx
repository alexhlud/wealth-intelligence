// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ValueItemsPage } from '@/features/assets/ValueItemsPage'
import { DashboardWithHistoryPage } from '@/features/history/DashboardWithHistoryPage'
import { HoldingsPage } from '@/features/portfolio/PortfolioPage'
import { FuturePage } from '@/features/projections/FuturePage'

const portfolioId = '11111111-1111-4111-8111-111111111111'
const accountId = '22222222-2222-4222-8222-222222222222'
const asOf = '2026-11-20T12:00:00.000Z'

const { rows, rpc, invoke } = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('@/features/history/RecordedNetWorthChart', () => ({
  RecordedNetWorthChart: () => <div>Recorded net worth</div>,
}))

/** A query builder: a resolved promise that also accepts any filter chain. */
function queryFor(table: string) {
  const result = { data: rows[table] ?? [], error: null }
  const builder = Object.assign(Promise.resolve(result), {} as Record<string, unknown>)
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'is', 'neq']) {
    builder[method] = () => builder
  }
  return builder
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    functions: { invoke },
    from: (table: string) => queryFor(table),
  },
}))

function quote(symbol: string) {
  const now = new Date().toISOString()
  return {
    symbol,
    price: '500',
    previousClose: '500',
    change: '0',
    changePercent: '0',
    marketTimestamp: now,
    fetchedAt: now,
    lastSuccessfulAt: now,
    source: 'finnhub',
    freshness: 'fresh',
    delayMinutes: null,
    unavailableReason: null,
  }
}

function position(id: string, symbol: string, quantity: string, averageCost: string) {
  return {
    id,
    account_id: accountId,
    symbol,
    security_name: `${symbol} fund`,
    asset_type: 'etf',
    status: 'open',
    quantity,
    average_cost: averageCost,
    last_event_at: asOf,
  }
}

function valueItem(id: string, name: string, extra: Record<string, unknown>) {
  return {
    id,
    portfolio_id: portfolioId,
    account_id: null,
    name,
    currency_code: 'USD',
    include_in_net_worth: true,
    notes: null,
    ...extra,
  }
}

function setRows(options: { liabilityBalance: string }) {
  rows.portfolios = [{ id: portfolioId, name: 'Primary portfolio' }]
  rows.accounts = [{
    id: accountId,
    portfolio_id: portfolioId,
    name: 'Taxable',
    institution_name: null,
    account_type: 'brokerage',
    include_in_net_worth: true,
    currency_code: 'USD',
  }]
  rows.positions = [
    position('44444444-4444-4444-8444-444444444444', 'QQQ', '2', '0'),
    position('55555555-5555-4555-8555-555555555555', 'VOO', '0.000000123456', '0'),
  ]
  rows.manual_assets = [valueItem('66666666-6666-4666-8666-666666666666', 'Cash drawer', {
    category: 'cash',
    current_value: '0',
    value_as_of: asOf,
  })]
  rows.liabilities = [valueItem('77777777-7777-4777-8777-777777777777', 'Home loan', {
    category: 'mortgage',
    outstanding_balance: options.liabilityBalance,
    balance_as_of: asOf,
  })]
}

function renderPage(page: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{page}</QueryClientProvider>
    </MemoryRouter>,
  )
}

function expectNoLoadError() {
  expect(screen.queryByText('We couldn’t load this information.')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
}

describe('zero values load on every page', () => {
  beforeEach(() => {
    setRows({ liabilityBalance: '0' })
    rpc.mockImplementation((name: string) => Promise.resolve(name === 'ensure_primary_portfolio'
      ? { data: { id: portfolioId, name: 'Primary portfolio' }, error: null }
      : { data: [], error: null }))
    invoke.mockImplementation(
      (_name: string, { body }: { body: { symbols: string[] } }) =>
        Promise.resolve({ data: { quotes: body.symbols.map(quote) }, error: null }),
    )
  })

  afterEach(() => {
    cleanup()
    rpc.mockReset()
    invoke.mockReset()
  })

  it('Overview', async () => {
    renderPage(<DashboardWithHistoryPage />)
    // 2 QQQ at $500 plus 0.000000123456 VOO, which rounds to no cents.
    expect((await screen.findAllByText('$1,000.00')).length).toBeGreaterThan(0)
    expectNoLoadError()
  })

  it('Holdings, with a $0 cost basis and a 12-place quantity shown exactly', async () => {
    renderPage(<HoldingsPage />)
    const row = (await screen.findByText('VOO fund')).closest('tr')!
    expect(within(row).getByText('0.000000123456')).toBeTruthy()
    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0)
    expectNoLoadError()
  })

  it('Assets', async () => {
    renderPage(<ValueItemsPage kind="asset" />)
    expect(await screen.findByText('Cash drawer')).toBeTruthy()
    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0)
    expectNoLoadError()
  })

  it('Liabilities', async () => {
    renderPage(<ValueItemsPage kind="liability" />)
    expect(await screen.findByText('Home loan')).toBeTruthy()
    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0)
    expectNoLoadError()
  })

  it('Future', async () => {
    renderPage(<FuturePage />)
    expect(await screen.findByText('Future, under stated assumptions.')).toBeTruthy()
    expect(screen.getByText(/Non-investment assets \$0\.00/)).toBeTruthy()
    // A zero liability has nothing to deduct, so it carries no minus sign.
    expect(screen.getByText(/Liabilities \$0\.00/)).toBeTruthy()
    expect(screen.queryAllByText(/−\$0\.00/)).toEqual([])
    expectNoLoadError()
  })
})

describe('negative net worth on Overview', () => {
  beforeEach(() => {
    setRows({ liabilityBalance: '1234.5' })
    rpc.mockImplementation((name: string) => Promise.resolve(name === 'ensure_primary_portfolio'
      ? { data: { id: portfolioId, name: 'Primary portfolio' }, error: null }
      : { data: [], error: null }))
    invoke.mockImplementation(
      (_name: string, { body }: { body: { symbols: string[] } }) =>
        Promise.resolve({ data: { quotes: body.symbols.map(quote) }, error: null }),
    )
  })

  afterEach(() => {
    cleanup()
    rpc.mockReset()
    invoke.mockReset()
  })

  it('keeps the minus sign on a nonzero Future liability', async () => {
    renderPage(<FuturePage />)
    expect(await screen.findByText(/Liabilities −\$1,234\.50/)).toBeTruthy()
  })

  it('shows a U+2212 minus before the dollar sign', async () => {
    renderPage(<DashboardWithHistoryPage />)
    // $1,000.00 of investments less a $1,234.50 balance.
    expect((await screen.findAllByText('−$234.50')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/\$-/)).toBeNull()
    expectNoLoadError()
  })
})
