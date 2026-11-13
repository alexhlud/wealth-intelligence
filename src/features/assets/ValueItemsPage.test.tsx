// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ValueItemsPage } from './ValueItemsPage'

const portfolioId = '11111111-1111-4111-8111-111111111111'
const insert = vi.fn(() => Promise.resolve({ error: null }))
const update = vi.fn((_value: unknown) => ({ eq: () => Promise.resolve({ error: null }) }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const data = table === 'portfolios'
        ? [{ id: portfolioId, name: 'Primary' }]
        : table === 'accounts'
          ? []
          : [{ id: '22222222-2222-4222-8222-222222222222', portfolio_id: portfolioId, account_id: null, name: 'Cash', category: 'cash', current_value: '10', currency_code: 'USD', include_in_net_worth: true, notes: null, value_as_of: '2026-01-15T16:30:00.000Z' }]
      const builder = { eq: () => builder, limit: () => Promise.resolve({ data, error: null }), order: () => Promise.resolve({ data, error: null }) }
      return { select: () => builder, insert, update }
    },
  },
}))

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ValueItemsPage kind="asset" /></QueryClientProvider>)
}

describe('ValueItemsPage datetime-local values', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    insert.mockClear()
    update.mockClear()
  })

  it('prefills and resubmits an unchanged asset timestamp without shifting it', async () => {
    vi.stubEnv('TZ', 'America/New_York')
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('As of')).toHaveProperty('value', '2026-01-15T11:30')
    fireEvent.click(screen.getByRole('button', { name: 'Save asset' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0]?.[0]).toMatchObject({ value_as_of: '2026-01-15T16:30:00.000Z' })
  })
})
