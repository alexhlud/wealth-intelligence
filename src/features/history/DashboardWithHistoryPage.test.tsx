// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardWithHistoryPage } from './DashboardWithHistoryPage'

const portfolioId = '11111111-1111-4111-8111-111111111111'
const { invoke, rpc } = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }))

vi.mock('./RecordedNetWorthChart', () => ({
  RecordedNetWorthChart: () => <div>Recorded net worth</div>,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    functions: { invoke },
    from: (table: string) => {
      const accountA = '22222222-2222-4222-8222-222222222222'
      const accountB = '33333333-3333-4333-8333-333333333333'
      const rows = table === 'accounts'
        ? [
          { id: accountA, portfolio_id: portfolioId, name: 'Taxable', institution_name: null, account_type: 'brokerage', include_in_net_worth: true, currency_code: 'USD' },
          { id: accountB, portfolio_id: portfolioId, name: 'Retirement', institution_name: null, account_type: 'retirement', include_in_net_worth: true, currency_code: 'USD' },
        ]
        : table === 'positions'
          ? [
            { id: '44444444-4444-4444-8444-444444444444', account_id: accountA, symbol: 'QQQ', security_name: 'Invesco QQQ', asset_type: 'etf', status: 'open', quantity: '2', average_cost: '400' },
            { id: '55555555-5555-4555-8555-555555555555', account_id: accountB, symbol: 'QQQ', security_name: 'Invesco QQQ', asset_type: 'etf', status: 'open', quantity: '3', average_cost: '400' },
          ]
          : []
      const builder = { eq: () => builder, order: () => Promise.resolve({ data: rows, error: null }) }
      return { select: () => builder }
    },
  },
}))

describe('DashboardWithHistoryPage', () => {
  afterEach(() => {
    cleanup()
    invoke.mockReset()
    rpc.mockReset()
  })

  it('renders the shared ticker value when two accounts hold it', async () => {
    const timestamp = '2026-11-13T20:00:00.000Z'
    rpc.mockResolvedValue({ data: { id: portfolioId, name: 'Primary portfolio' }, error: null })
    invoke.mockImplementation((_name: string, { body }: { body: { symbols: string[] } }) => Promise.resolve({
      data: { quotes: body.symbols.map((symbol) => ({ symbol, price: '500', previousClose: '499', change: '1', changePercent: '0.2', marketTimestamp: timestamp, fetchedAt: timestamp, lastSuccessfulAt: timestamp, source: 'finnhub', freshness: 'fresh', delayMinutes: null, unavailableReason: null })) },
      error: null,
    }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<MemoryRouter><QueryClientProvider client={client}><DashboardWithHistoryPage /></QueryClientProvider></MemoryRouter>)

    expect((await screen.findAllByText('$2,500.00')).length).toBeGreaterThan(0)
    expect(screen.queryByText('We couldn\'t display this page')).toBeNull()
    expect(invoke).toHaveBeenCalledWith('market-data', {
      body: { operation: 'quotes', symbols: ['QQQ'] },
    })
  })
})
