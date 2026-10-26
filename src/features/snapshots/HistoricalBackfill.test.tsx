// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoricalBackfill } from './HistoricalBackfill'

const { invoke, rpc } = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke }, rpc } }))
const portfolioId = '11111111-1111-1111-1111-111111111111'
function renderFlow() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><HistoricalBackfill portfolioId={portfolioId} onClose={vi.fn()} /></QueryClientProvider>) }
describe('HistoricalBackfill', () => {
  afterEach(() => { cleanup(); invoke.mockReset(); rpc.mockReset() })
  it('resolves a session without requesting prices and saves only labelled user-supplied price data', async () => {
    invoke.mockResolvedValue({ data: { session: { kind: 'session', asOfDate: '2026-10-23', marketCloseAt: '2026-10-23T20:00:00.000Z' } }, error: null })
    rpc.mockResolvedValue({ error: null })
    renderFlow()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-23' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify XNYS session' }))
    await screen.findByText(/Verified XNYS close/)
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0]!, { target: { value: 'Brokerage' } }); fireEvent.change(inputs[1]!, { target: { value: 'QQQ' } }); fireEvent.change(inputs[2]!, { target: { value: 'Invesco QQQ' } }); fireEvent.change(inputs[3]!, { target: { value: '2.5' } }); fireEvent.change(inputs[4]!, { target: { value: '100' } }); fireEvent.change(inputs[5]!, { target: { value: '120.25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save historical snapshot' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledOnce())
    expect(invoke).toHaveBeenCalledWith('market-data', { body: { operation: 'historical_session', asOfDate: '2026-10-23' } })
    expect(rpc.mock.calls[0]?.[0]).toBe('create_historical_backfill')
    expect(rpc.mock.calls[0]?.[1].p_positions[0]).toMatchObject({ source_position_id: null, market_price: '120.25', price_kind: 'manual', price_source: 'user supplied manual price' })
  })
  it('blocks a non-session with clear copy', async () => {
    invoke.mockResolvedValue({ data: { session: { kind: 'non_session', asOfDate: '2026-10-24', reason: 'weekend' } }, error: null })
    renderFlow(); fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-24' } }); fireEvent.click(screen.getByRole('button', { name: 'Verify XNYS session' }))
    expect((await screen.findByRole('alert')).textContent).toContain('weekend')
    expect((screen.getByRole('button', { name: 'Save historical snapshot' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
