import { afterEach, describe, expect, it, vi } from 'vitest'
import { compareRecordedHoldings, compareRecordedValues, loadSnapshotDetail, RecordedSnapshotDetailContractError } from './data'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))

const recordedDetailResponse = {
  snapshot: {
    id: '33333333-3333-4333-8333-333333333333', as_of_date: '2026-09-30', market_close_at: '2026-09-30T20:00:00.000Z',
    total_net_worth: '522451.80000000', created_at: '2026-09-30T20:01:00.000Z', source: 'backfill', investment_value: '520000.00',
    manual_asset_value: '2451.80', liability_value: '0.00', exchange_mic: 'XNYS', exchange_timezone: 'America/New_York',
  },
  positions: [
    { source_position_id: null, account_label: 'Brokerage', symbol: 'QQQ', security_name: 'Invesco QQQ Trust', asset_type: 'etf', quantity: '16.000000000000', average_cost: '400.00000000', market_price: '480.00000000', price_at: '2026-09-30T20:00:00.000Z', market_value: '7680.00000000', cost_basis: '6400.00000000', unrealized_gain: '1280.00000000', portfolio_weight: '0.014769000000', price_source: 'user supplied manual price', price_kind: 'manual' },
    { source_position_id: null, account_label: 'Brokerage', symbol: 'VOO', security_name: 'Vanguard S&P 500 ETF', asset_type: 'etf', quantity: '8.000000000000', average_cost: '500.00000000', market_price: '550.00000000', price_at: '2026-09-30T20:00:00.000Z', market_value: '4400.00000000', cost_basis: '4000.00000000', unrealized_gain: '400.00000000', portfolio_weight: '0.008422000000', price_source: 'user supplied manual price', price_kind: 'manual' },
  ],
  manual_assets: [],
  liabilities: [{ source_liability_id: null, name: 'Car loan', category: 'vehicle_loan', account_label: null, value: '18000.00000000', include_in_net_worth: true, effective_at: '2026-09-30T20:00:00.000Z' }],
}

describe('loadSnapshotDetail', () => {
  afterEach(() => { rpc.mockReset(); vi.restoreAllMocks() })

  it('parses the exact recorded-detail shape, including backfilled liabilities', async () => {
    rpc.mockResolvedValue({ data: recordedDetailResponse, error: null })

    await expect(loadSnapshotDetail('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')).resolves.toMatchObject({
      positions: [{ symbol: 'QQQ', source_position_id: null }, { symbol: 'VOO', source_position_id: null }],
      liabilities: [{ name: 'Car loan', value: '18000.00000000', source_liability_id: null }],
    })
  })

  it('rejects numeric JSON values and reports a sanitized Zod issue in development', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    rpc.mockResolvedValue({ data: { ...recordedDetailResponse, snapshot: { ...recordedDetailResponse.snapshot, total_net_worth: 522451.8 } }, error: null })

    await expect(loadSnapshotDetail('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')).rejects.toMatchObject({
      name: RecordedSnapshotDetailContractError.name,
      issues: [{ path: 'snapshot.total_net_worth', code: 'invalid_type', rule: 'Invalid input: expected string, received number' }],
    })
    expect(consoleError).toHaveBeenCalledWith('Recorded snapshot detail contract validation failed.', {
      issues: [{ path: 'snapshot.total_net_worth', code: 'invalid_type', rule: 'Invalid input: expected string, received number' }],
    })
  })
})

describe('recorded-date comparison facts', () => {
  const snapshot = (positions: unknown[], manual_assets: unknown[] = [], liabilities: unknown[] = []) => ({ ...recordedDetailResponse, positions, manual_assets, liabilities }) as Awaited<ReturnType<typeof loadSnapshotDetail>>
  const holding = (symbol: string, quantity: string, value: string, weight = '0.100000000000') => ({ ...recordedDetailResponse.positions[0], symbol, quantity, market_value: value, portfolio_weight: weight })

  it('classifies immutable recorded holdings without creating absent-side zero values', () => {
    const changes = compareRecordedHoldings(snapshot([holding('QQQ', '10.000000000000', '1000.00'), holding('VOO', '2.000000000000', '200.00')]), snapshot([holding('QQQ', '12.000000000000', '1440.00'), holding('NVDA', '3.000000000000', '300.00')]))
    expect(changes.map((change) => change.kind)).toEqual(expect.arrayContaining(['increased', 'removed', 'added']))
    expect(changes.find((change) => change.earlier?.symbol === 'VOO')).toMatchObject({ later: null, quantityChange: null, valueChange: null })
    expect(changes.find((change) => change.later?.symbol === 'NVDA')).toMatchObject({ earlier: null, quantityChange: null, valueChange: null })
    expect(changes.find((change) => change.earlier?.symbol === 'QQQ')).toMatchObject({ quantityChange: '2', valueChange: '440', allocationPointChange: '0' })
  })

  it('compares recorded manual values without numeric coercion', () => {
    const values = compareRecordedValues([{ name: 'Cash', category: 'cash', account_label: 'Savings', value: '1000.10' }], [{ name: 'Cash', category: 'cash', account_label: 'Savings', value: '1000.30' }, { name: 'Home', category: 'real_estate', account_label: null, value: '500000.00' }])
    expect(values).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Cash', change: '0.2' }), expect.objectContaining({ name: 'Home', earlier: null, later: '500000.00', change: null })]))
  })
})
