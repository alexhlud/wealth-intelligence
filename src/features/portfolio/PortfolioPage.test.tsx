// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountsPage, HoldingsPage } from './PortfolioPage'

const portfolioId = '11111111-1111-4111-8111-111111111111'
const accountA = '22222222-2222-4222-8222-222222222222'
const accountB = '33333333-3333-4333-8333-333333333333'
const { insertAccount, rpc, invoke } = vi.hoisted(() => ({
  insertAccount: vi.fn(() => Promise.resolve({ error: null })),
  rpc: vi.fn((name: string) => Promise.resolve({ data: name === 'ensure_primary_portfolio' ? { id: portfolioId, name: 'Primary portfolio' } : null, error: null })),
  invoke: vi.fn(),
}))

const responses = {
  portfolios: [{ id: portfolioId, name: 'Primary portfolio' }],
  accounts: [
    { id: accountA, portfolio_id: portfolioId, name: 'Taxable', institution_name: null, account_type: 'brokerage', include_in_net_worth: true, currency_code: 'USD' },
    { id: accountB, portfolio_id: portfolioId, name: 'Retirement', institution_name: null, account_type: 'retirement', include_in_net_worth: true, currency_code: 'USD' },
  ],
  positions: [
    { id: '44444444-4444-4444-8444-444444444444', account_id: accountA, symbol: 'QQQ', security_name: 'Invesco QQQ', asset_type: 'etf', status: 'open', quantity: '2', average_cost: '400' },
    { id: '55555555-5555-4555-8555-555555555555', account_id: accountB, symbol: 'VOO', security_name: 'Vanguard S&P 500', asset_type: 'etf', status: 'open', quantity: '3', average_cost: '500' },
  ],
}

function quote(symbol: string) {
  const price = symbol === 'QQQ' ? '500' : symbol === 'VOO' ? '600' : null
  const now = new Date().toISOString()
  return { symbol, price, previousClose: price, change: price ? '1' : null, changePercent: price ? '1' : null, marketTimestamp: price ? now : null, fetchedAt: now, lastSuccessfulAt: price ? now : null, source: 'finnhub', freshness: price ? 'fresh' : 'unavailable', delayMinutes: null, unavailableReason: price ? null : 'not_found' }
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    functions: { invoke },
    from: (table: keyof typeof responses) => {
      const builder = {
        eq: () => builder,
        limit: () => Promise.resolve({ data: responses[table], error: null }),
        order: () => Promise.resolve({ data: responses[table], error: null }),
      }
      return { select: () => builder, insert: insertAccount }
    },
  },
}))

function renderHoldings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><HoldingsPage /></QueryClientProvider>)
}

function renderAccounts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><AccountsPage /></QueryClientProvider>)
}

describe('HoldingsPage account filters', () => {
  beforeEach(() => {
    invoke.mockImplementation((_name: string, { body }: { body: { symbols: string[] } }) => Promise.resolve({ data: { quotes: body.symbols.map((symbol) => quote(symbol)) }, error: null }))
  })
  afterEach(() => { cleanup(); insertAccount.mockClear(); rpc.mockClear(); invoke.mockReset(); sessionStorage.clear() })

  it('renders open positions, filters to one account, and preserves the zero-selection empty state', async () => {
    renderHoldings()

    expect(await screen.findByText('Invesco QQQ')).toBeTruthy()
    expect(screen.getByText('Vanguard S&P 500')).toBeTruthy()
    expect(await screen.findByText('$2,800.00')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Account selection: All accounts'))
    fireEvent.click(screen.getByRole('checkbox', { name: /Taxable/ }))
    expect(screen.queryByText('Invesco QQQ')).toBeNull()
    expect(screen.getByText('Vanguard S&P 500')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText('$1,800.00')).toHaveLength(2))
    expect(invoke).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByText('Select at least one account to inspect its holdings.')).toBeTruthy()
  })

  it('renders the first-run empty state after creating a portfolio with no accounts or positions', async () => {
    const accounts = [...responses.accounts]
    const positions = [...responses.positions]
    responses.accounts.splice(0)
    responses.positions.splice(0)

    renderHoldings()

    try {
      expect(await screen.findByText('Add an account before you record its holdings.')).toBeTruthy()
      expect(screen.queryByText(/Loading your holdings/)).toBeNull()
      expect(rpc).toHaveBeenCalledWith('ensure_primary_portfolio')
    } finally {
      responses.accounts.splice(0, responses.accounts.length, ...accounts)
      responses.positions.splice(0, responses.positions.length, ...positions)
    }
  })

  it('discloses near the total when a selected holding has no available price', async () => {
    responses.positions.push({ id: '66666666-6666-4666-8666-666666666666', account_id: accountA, symbol: 'BND', security_name: 'Vanguard Total Bond Market', asset_type: 'other', status: 'open', quantity: '4', average_cost: '70' })

    renderHoldings()

    try {
      expect(await screen.findByText('$2,800.00')).toBeTruthy()
      expect(screen.getByText('1 holding excluded, price unavailable.')).toBeTruthy()
      expect(screen.getByText('No quote found. Check the ticker.')).toBeTruthy()
    } finally {
      responses.positions.pop()
    }
  })

  it('requests and displays a quote for an open position categorized as other', async () => {
    responses.positions[0]!.asset_type = 'other'
    try {
      renderHoldings()
      expect(await screen.findByText('$2,800.00')).toBeTruthy()
      expect(within(screen.getByText('Invesco QQQ').closest('tr')!).getByText('$500.00')).toBeTruthy()
      expect(screen.getAllByText('Fresh')).toHaveLength(2)
      expect(invoke).toHaveBeenCalledWith('market-data', { body: { operation: 'quotes', symbols: ['QQQ', 'VOO'] } })
      expect(screen.queryByText('Only US stocks and ETFs are supported.')).toBeNull()
    } finally { responses.positions[0]!.asset_type = 'etf' }
  })

  it('labels delayed and stale prices with their true timestamp and preserves holdings', async () => {
    const timestamp = new Date(Date.now() - 12 * 60_000).toISOString()
    invoke.mockImplementation((_name: string, { body }: { body: { symbols: string[] } }) => Promise.resolve({ data: { quotes: body.symbols.map((symbol) => symbol === 'QQQ' ? { ...quote(symbol), freshness: 'stale', lastSuccessfulAt: timestamp } : { ...quote(symbol), freshness: 'delayed', delayMinutes: 15 }) }, error: null }))
    renderHoldings()
    expect(await screen.findByText('Delayed 15 minutes')).toBeTruthy()
    expect(screen.getAllByText(new RegExp(`Last updated 12 minutes ago`)).length).toBeGreaterThan(0)
    expect(screen.getByText('Includes stale prices.')).toBeTruthy()
    expect(screen.getByText('Includes delayed prices.')).toBeTruthy()
    expect(screen.getByText('Invesco QQQ')).toBeTruthy()
    expect(screen.getByText('Vanguard S&P 500')).toBeTruthy()
  })

  it('retains and labels last-known prices when a manual refresh fails', async () => {
    renderHoldings()
    expect(await screen.findByText('$2,800.00')).toBeTruthy()
    invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Prices' }))
    expect(await screen.findByText(/Prices could not be refreshed/)).toBeTruthy()
    expect(screen.getByText('$2,800.00')).toBeTruthy()
    expect(screen.getByText('Includes stale prices.')).toBeTruthy()
    expect(screen.getByText('Invesco QQQ')).toBeTruthy()
  })

  it('keeps holdings visible when the first quote request fails', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('offline') })
    renderHoldings()
    expect(await screen.findByText(/Prices could not be refreshed/)).toBeTruthy()
    expect(screen.getByText('Invesco QQQ')).toBeTruthy()
    expect(screen.getByText('2 holdings excluded, price unavailable.')).toBeTruthy()
    expect(screen.queryByText('$0.00')).toBeNull()
  })

  it('keeps positions visible while quotes load and disables refresh until they return', async () => {
    let finish!: (value: unknown) => void
    invoke.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    renderHoldings()
    expect(await screen.findByText('Invesco QQQ')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Refreshing prices…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('2 holdings excluded, price unavailable.')).toBeTruthy()
    finish({ data: { quotes: [quote('QQQ'), quote('VOO')] }, error: null })
    expect(await screen.findByText('$2,800.00')).toBeTruthy()
  })

  it('requests non-USD account symbols but excludes their values', async () => {
    responses.accounts[1]!.currency_code = 'EUR'
    try {
      renderHoldings()
      expect(await screen.findAllByText('$1,000.00')).toHaveLength(2)
      expect(screen.getByText('Non-USD prices are not supported.')).toBeTruthy()
      expect(screen.getByText('1 holding excluded, price unavailable.')).toBeTruthy()
      expect(invoke).toHaveBeenCalledWith('market-data', { body: { operation: 'quotes', symbols: ['QQQ', 'VOO'] } })
    } finally { responses.accounts[1]!.currency_code = 'USD' }
  })

  it('renders the exact integer-only total for holdings across selected accounts', async () => {
    const original = [...responses.positions]
    responses.positions.splice(0, responses.positions.length,
      { ...original[0]!, quantity: '20.5' },
      { ...original[1]!, symbol: 'QQQ', quantity: '20.5' },
    )

    renderHoldings()

    try {
      expect(await screen.findByText('$20,500.00')).toBeTruthy()
    } finally {
      responses.positions.splice(0, responses.positions.length, ...original)
    }
  })

  it('closes the selector on outside interaction and Escape, returning focus to its trigger', async () => {
    renderHoldings()
    const trigger = await screen.findByLabelText('Account selection: All accounts')

    fireEvent.click(trigger)
    expect(screen.getByRole('checkbox', { name: /Taxable/ })).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('checkbox', { name: /Taxable/ })).toBeNull()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('checkbox', { name: /Taxable/ })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('submits a blank optional institution as null through the add-account form', async () => {
    renderAccounts()
    fireEvent.click(await screen.findByRole('button', { name: 'Add account' }))
    fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'New taxable account' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save account' }))

    await waitFor(() => expect(insertAccount).toHaveBeenCalledWith(expect.objectContaining({
      institution_name: null,
      name: 'New taxable account',
      portfolio_id: portfolioId,
    })))
    expect(screen.queryByText('Invalid input: expected string, received null')).toBeNull()
  })

  it('uses create_position rather than a direct positions write when the add form is submitted', async () => {
    renderHoldings()
    fireEvent.click(await screen.findByRole('button', { name: /Add position/ }))
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: accountA } })
    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: ' qqq ' } })
    fireEvent.change(screen.getByLabelText('Security name'), { target: { value: 'Invesco QQQ' } })
    fireEvent.change(screen.getByLabelText('Shares'), { target: { value: '20.5' } })
    fireEvent.change(screen.getByLabelText('Average cost'), { target: { value: '400' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save position' }))

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('create_position', expect.objectContaining({
      p_account_id: accountA, p_symbol: 'QQQ', p_quantity: '20.5', p_average_cost: '400',
    })))
  })
})
