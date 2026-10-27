// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage } from './HistoryPage'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

const portfolio = { id: '11111111-1111-4111-8111-111111111111', name: 'Primary' }
const snapshots = [
  { id: '22222222-2222-4222-8222-222222222222', as_of_date: '2026-08-28', market_close_at: '2026-08-28T20:00:00.000Z', total_net_worth: '100000.00', created_at: '2026-08-28T20:01:00.000Z', source: 'backfill' },
  { id: '33333333-3333-4333-8333-333333333333', as_of_date: '2026-09-30', market_close_at: '2026-09-30T20:00:00.000Z', total_net_worth: '102500.00', created_at: '2026-09-30T20:01:00.000Z', source: 'backfill' },
]
const detail = { snapshot: { ...snapshots[1], investment_value: '100000.00', manual_asset_value: '2500.00', liability_value: '0.00', exchange_mic: 'XNYS', exchange_timezone: 'America/New_York' }, positions: [], manual_assets: [], liabilities: [] }
const recordedPositions = [
  { source_position_id: null, account_label: 'Brokerage', symbol: 'QQQ', security_name: 'Invesco QQQ Trust', asset_type: 'etf', quantity: '16.000000000000', average_cost: '400.00000000', market_price: '480.00000000', price_at: '2026-09-30T20:00:00.000Z', market_value: '7680.00000000', cost_basis: '6400.00000000', unrealized_gain: '1280.00000000', portfolio_weight: '0.477030224746', price_source: 'user supplied manual price', price_kind: 'manual' },
  { source_position_id: null, account_label: 'Brokerage', symbol: 'VOO', security_name: 'Vanguard S&P 500 ETF', asset_type: 'etf', quantity: '20.500000000000', average_cost: '500.00000000', market_price: '550.00000000', price_at: '2026-09-30T20:00:00.000Z', market_value: '11275.00000000', cost_basis: '10250.00000000', unrealized_gain: '1025.00000000', portfolio_weight: '0.522969775254', price_source: 'user supplied manual price', price_kind: 'manual' },
]

function renderPage(path = '/history?date=2026-08-28', detailResponse: unknown = detail) {
  rpc.mockImplementation((name: string) => {
    if (name === 'ensure_primary_portfolio') return Promise.resolve({ data: portfolio, error: null })
    if (name === 'list_recorded_snapshot_history') return Promise.resolve({ data: snapshots, error: null })
    return Promise.resolve({ data: detailResponse, error: null })
  })
  render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HistoryPage /></QueryClientProvider></MemoryRouter>)
}

describe('HistoryPage', () => {
  afterEach(() => { cleanup(); rpc.mockReset(); vi.restoreAllMocks() })

  it('uses a stored deep-link date and lets the recorded-day picker pin another fact', async () => {
    renderPage()
    expect(await screen.findByText('As of Aug 28, 2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    fireEvent.click(within(await screen.findByRole('list', { name: /September 2026/ })).getByRole('button', { name: /Sep 30, 2026, \$102,500/ }))
    expect(await screen.findByText('As of Sep 30, 2026')).toBeTruthy()
    expect(await screen.findByText('Recorded composition')).toBeTruthy()
  })

  it('falls back truthfully when a deep link is not a recorded date', async () => {
    renderPage('/history?date=invalid')
    expect(await screen.findByText(/That date has no recorded snapshot/)).toBeTruthy()
    expect(screen.getByText('As of Sep 30, 2026')).toBeTruthy()
  })

  it('distinguishes an unverifiable recorded-detail contract from a request failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderPage('/history?date=2026-09-30', { ...detail, liabilities: [{ source_liability_id: null, name: 'Car loan', category: 'vehicle_loan', account_label: null, balance: '18000.00000000', include_in_net_worth: true, effective_at: '2026-09-30T20:00:00.000Z' }] })
    expect(await screen.findByText('We received this recorded snapshot, but could not verify its details.')).toBeTruthy()
  })

  it('formats recorded quantities and allocation fractions when rendering the holdings table', async () => {
    renderPage('/history?date=2026-09-30', { ...detail, positions: recordedPositions })
    expect(await screen.findByText('16')).toBeTruthy()
    expect(screen.getByText('20.5')).toBeTruthy()
    expect(screen.getByText('47.70%')).toBeTruthy()
    expect(screen.getByText('52.30%')).toBeTruthy()
    expect(screen.queryByText('16.000000000000')).toBeNull()
    expect(screen.queryByText('0.477030224746')).toBeNull()
  })

  it('opens a two-recorded-date comparison with explicit earlier and later selectors', async () => {
    renderPage('/history?date=2026-08-28')
    fireEvent.click(await screen.findByRole('button', { name: 'Compare recorded dates' }))
    expect(screen.getByLabelText('Earlier')).toBeTruthy()
    expect(screen.getByLabelText('Later')).toBeTruthy()
    expect(await screen.findByText(/Recorded change between these snapshots/)).toBeTruthy()
    expect(await screen.findByText('Recorded holdings')).toBeTruthy()
    expect(screen.getAllByText('Manual assets').length).toBeGreaterThan(1)
    expect(screen.getAllByText('Liabilities').length).toBeGreaterThan(1)
  })
})
