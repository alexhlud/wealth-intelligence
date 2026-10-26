// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CorrectionEditor } from './CorrectionEditor'

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from, rpc } }))

const snapshotId = '11111111-1111-4111-8111-111111111111'
const portfolioId = '22222222-2222-4222-8222-222222222222'
const positionId = '33333333-3333-4333-8333-333333333333'
const assetId = '44444444-4444-4444-8444-444444444444'
const liabilityId = '55555555-5555-4555-8555-555555555555'
const close = '2026-10-23T20:00:00+00:00'

function table(data: unknown) { return { select: () => ({ eq: () => Promise.resolve({ data, error: null }) }) } }
function renderEditor() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); const onClose = vi.fn(); render(<QueryClientProvider client={client}><CorrectionEditor snapshotId={snapshotId} portfolioId={portfolioId} onClose={onClose} /></QueryClientProvider>); return { onClose } }

describe('CorrectionEditor', () => {
  afterEach(() => { cleanup(); from.mockReset(); rpc.mockReset() })

  it('opens a single uncorrected snapshot without a conflict warning and submits its complete composition', async () => {
    from.mockImplementation((name: string) => name === 'snapshot_positions' ? table([
      { source_position_id: positionId, account_label: 'Brokerage', symbol: 'QQQ', security_name: 'Invesco QQQ', asset_type: 'etf', quantity: '20', average_cost: '100', market_price: '500', price_at: close, price_source: 'recorded close', price_kind: 'raw_close' },
      { source_position_id: null, account_label: 'Brokerage', symbol: 'VOO', security_name: 'Vanguard S&P 500', asset_type: 'etf', quantity: '10', average_cost: '200', market_price: '600', price_at: close, price_source: 'recorded close', price_kind: 'raw_close' },
    ]) : name === 'snapshot_manual_assets' ? table([{ source_manual_asset_id: assetId, name: 'Cash', category: 'cash', account_label: null, value: '1200', include_in_net_worth: true, currency_code: 'USD', effective_at: close }]) : table([{ source_liability_id: liabilityId, name: 'Mortgage', category: 'mortgage', account_label: null, balance: '500', include_in_net_worth: true, currency_code: 'USD', effective_at: close }]))
    rpc.mockResolvedValue({ error: null })
    const { onClose } = renderEditor()

    await screen.findByDisplayValue('QQQ')
    expect(screen.getByDisplayValue('VOO')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Holdings' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Manual assets' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Liabilities' })).toBeTruthy()
    expect(screen.queryByText(/newer revision/i)).toBeNull()

    fireEvent.change(screen.getByLabelText('Reason for correction'), { target: { value: 'Correct recorded close' } })
    fireEvent.click(screen.getByRole('button', { name: 'Append correction' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(rpc).toHaveBeenCalledWith('correct_portfolio_snapshot', expect.objectContaining({
      p_snapshot_id: snapshotId,
      p_positions: expect.arrayContaining([expect.objectContaining({ symbol: 'QQQ', market_price: '500' }), expect.objectContaining({ symbol: 'VOO', market_price: '600' })]),
      p_manual_assets: [expect.objectContaining({ source_manual_asset_id: assetId, name: 'Cash', value: '1200' })],
      p_liabilities: [expect.objectContaining({ source_liability_id: liabilityId, name: 'Mortgage', balance: '500' })],
    }))
  })

  it('does not mislabel a generic RPC failure as a revision conflict', async () => {
    from.mockImplementation((name: string) => table(name === 'snapshot_positions' ? [{ source_position_id: positionId, account_label: 'Brokerage', symbol: 'QQQ', security_name: 'Invesco QQQ', asset_type: 'etf', quantity: '20', average_cost: '100', market_price: '500', price_at: close, price_source: 'recorded close', price_kind: 'raw_close' }] : []))
    rpc.mockResolvedValue({ error: { code: '22023', message: 'Invalid snapshot correction' } })
    renderEditor()
    await screen.findByDisplayValue('QQQ')
    fireEvent.change(screen.getByLabelText('Reason for correction'), { target: { value: 'Correct recorded close' } })
    fireEvent.click(screen.getByRole('button', { name: 'Append correction' }))
    expect((await screen.findByRole('alert')).textContent).toContain('We could not append this correction')
  })
})
