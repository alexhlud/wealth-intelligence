// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountsPage, HoldingsPage } from './PortfolioPage'

const portfolioId = '11111111-1111-4111-8111-111111111111'
const accountA = '22222222-2222-4222-8222-222222222222'
const accountB = '33333333-3333-4333-8333-333333333333'
const { insertAccount, rpc } = vi.hoisted(() => ({
  insertAccount: vi.fn(() => Promise.resolve({ error: null })),
  rpc: vi.fn(() => Promise.resolve({ error: null })),
}))

const responses = {
  portfolios: [{ id: portfolioId, name: 'Primary portfolio' }],
  accounts: [
    { id: accountA, portfolio_id: portfolioId, name: 'Taxable', institution_name: null, account_type: 'brokerage', include_in_net_worth: true },
    { id: accountB, portfolio_id: portfolioId, name: 'Retirement', institution_name: null, account_type: 'retirement', include_in_net_worth: true },
  ],
  positions: [
    { id: '44444444-4444-4444-8444-444444444444', account_id: accountA, symbol: 'QQQ', security_name: 'Invesco QQQ', asset_type: 'etf', status: 'open', quantity: '2', average_cost: '400' },
    { id: '55555555-5555-4555-8555-555555555555', account_id: accountB, symbol: 'VOO', security_name: 'Vanguard S&P 500', asset_type: 'etf', status: 'open', quantity: '3', average_cost: '500' },
  ],
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
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
  afterEach(() => { cleanup(); insertAccount.mockClear(); rpc.mockClear(); sessionStorage.clear() })

  it('renders open positions, filters to one account, and preserves the zero-selection empty state', async () => {
    renderHoldings()

    expect(await screen.findByText('Invesco QQQ')).toBeTruthy()
    expect(screen.getByText('Vanguard S&P 500')).toBeTruthy()
    expect(screen.getByText('$2,800.00')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Account selection: All accounts'))
    fireEvent.click(screen.getByRole('checkbox', { name: /Taxable/ }))
    expect(screen.queryByText('Invesco QQQ')).toBeNull()
    expect(screen.getByText('Vanguard S&P 500')).toBeTruthy()
    expect(screen.getAllByText('$1,800.00')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByText('Select at least one account to inspect its holdings.')).toBeTruthy()
  })

  it('discloses near the total when a selected holding has no available price', async () => {
    responses.positions.push({ id: '66666666-6666-4666-8666-666666666666', account_id: accountA, symbol: 'BND', security_name: 'Vanguard Total Bond Market', asset_type: 'etf', status: 'open', quantity: '4', average_cost: '70' })

    renderHoldings()

    try {
      expect(await screen.findByText('1 holding excluded, price unavailable.')).toBeTruthy()
      expect(screen.getByText('$2,800.00')).toBeTruthy()
    } finally {
      responses.positions.pop()
    }
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
