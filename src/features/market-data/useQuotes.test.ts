import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getQuotes } from './useQuotes'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const quote = (symbol: string) => ({ symbol, price: '1.25', previousClose: '1', change: '0.25', changePercent: '25', marketTimestamp: '2026-10-16T20:00:00Z', fetchedAt: '2026-10-16T20:01:00Z', lastSuccessfulAt: '2026-10-16T20:01:00Z', source: 'finnhub', freshness: 'fresh', delayMinutes: null, unavailableReason: null })

describe('quote requests', () => {
  beforeEach(() => { invoke.mockReset() })

  it('requests bounded batches without identity or credentials in the body', async () => {
    invoke.mockImplementation((_name: string, { body }: { body: { symbols: string[] } }) => Promise.resolve({ data: { quotes: body.symbols.map(quote) }, error: null }))
    const symbols = Array.from({ length: 26 }, (_, index) => `S${index}`)
    expect(await getQuotes(symbols)).toHaveLength(26)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls[0]?.[1]).toEqual({ body: { operation: 'quotes', symbols: symbols.slice(0, 25) } })
    expect(invoke.mock.calls[1]?.[1]).toEqual({ body: { operation: 'quotes', symbols: symbols.slice(25) } })
  })

  it('rejects malformed, incomplete, or unexpected responses', async () => {
    for (const quotes of [[{ ...quote('QQQ'), price: 12 }], [], [quote('VOO')], [{ ...quote('QQQ'), lastSuccessfulAt: null }]]) {
      invoke.mockResolvedValueOnce({ data: { quotes }, error: null })
      await expect(getQuotes(['QQQ'])).rejects.toThrow()
    }
  })
})
