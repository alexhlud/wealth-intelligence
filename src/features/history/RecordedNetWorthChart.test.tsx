// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecordedNetWorthChart } from './RecordedNetWorthChart'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

const portfolioId = '11111111-1111-1111-1111-111111111111'
const rows = [
  { id: '22222222-2222-4222-8222-222222222222', as_of_date: '2026-08-28', market_close_at: '2026-08-28T20:00:00.000Z', total_net_worth: '100000.00', created_at: '2026-08-28T20:01:00.000Z', source: 'backfill' },
  { id: '33333333-3333-4333-8333-333333333333', as_of_date: '2026-09-30', market_close_at: '2026-09-30T20:00:00.000Z', total_net_worth: '102500.00', created_at: '2026-09-30T20:01:00.000Z', source: 'backfill' },
]

function renderChart(path = '/') {
  rpc.mockResolvedValue({ data: rows, error: null })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={client}><RecordedNetWorthChart portfolioId={portfolioId} /></QueryClientProvider></MemoryRouter>)
}

describe('RecordedNetWorthChart', () => {
  afterEach(() => { cleanup(); rpc.mockReset() })

  it('pins a stored marker and leaves the connector non-interactive', async () => {
    renderChart()
    await screen.findByText('Dashed connector joins recorded snapshots only; no daily values are estimated between them.')
    const first = screen.getByRole('button', { name: /Aug 28, 2026/ })
    fireEvent.click(first)
    expect(screen.getByText('$100,000.00')).toBeTruthy()
    expect(rpc).toHaveBeenCalledWith('list_recorded_snapshot_history', { p_portfolio_id: portfolioId, p_start_date: null })
    expect(document.querySelector('.history-connector')?.getAttribute('pointer-events')).toBe('none')
  })

  it('renders the review-only empty state without changing the snapshot query', async () => {
    renderChart('/?historyPreview=empty')
    expect(await screen.findByText(/Review preview — rendering the empty state/)).toBeTruthy()
    expect(screen.getByText('No recorded snapshots yet. Save or add a verified historical snapshot to begin your history.')).toBeTruthy()
    expect(rpc).toHaveBeenCalledWith('list_recorded_snapshot_history', { p_portfolio_id: portfolioId, p_start_date: null })
  })
})
