import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFinnhubQuote, quoteRequestSchema, shouldUseCachedQuote } from '../../../supabase/functions/market-data/finnhub'
import { quoteSchema } from './contracts'

const fixture = { c: 709.8, d: -18.2, dp: -2.5, h: 725.96, l: 707.23, o: 725.52, pc: 728, t: 1792180800 }
const key = 'test-secret-do-not-log'

afterEach(() => vi.restoreAllMocks())

describe('Finnhub adapter', () => {
  it('bounds and deduplicates symbol requests and rejects a supplied user id', () => {
    expect(quoteRequestSchema.parse({ operation: 'quotes', symbols: [' qqq ', 'QQQ'] }).symbols).toEqual(['QQQ'])
    expect(quoteRequestSchema.safeParse({ operation: 'quotes', symbols: ['QQQ'], user_id: 'forged' }).success).toBe(false)
    expect(quoteRequestSchema.safeParse({ operation: 'quotes', symbols: [] }).success).toBe(false)
    expect(quoteRequestSchema.safeParse({ operation: 'quotes', symbols: Array(26).fill('QQQ') }).success).toBe(false)
    expect(quoteRequestSchema.safeParse({ operation: 'quotes', symbols: ['QQQ/USD'] }).success).toBe(false)
  })
  it('maps the exact provider fixture to decimal strings and a UTC timestamp accepted by the client', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture))
    const result = await fetchFinnhubQuote('QQQ', key, fetcher)
    expect(result).toEqual({ kind: 'quote', price: '709.8', previousClose: '728', change: '-18.2', changePercent: '-2.5', marketTimestamp: '2026-10-16T20:00:00.000Z' })
    if (result.kind !== 'quote') throw new Error('Expected a quote')
    expect(quoteSchema.safeParse({ symbol: 'QQQ', ...result, fetchedAt: '2026-10-16T20:05:00.000Z', lastSuccessfulAt: '2026-10-16T20:05:00.000Z', source: 'finnhub', freshness: 'fresh', delayMinutes: null, unavailableReason: null }).success).toBe(true)
  })

  it.each([
    {},
    { ...fixture, c: '709.8' },
    { ...fixture, d: null },
    { ...fixture, t: -1 },
    { ...fixture, c: 0.0000000000001 },
  ])('logs malformed responses without leaking values or the key', async (payload) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await fetchFinnhubQuote('QQQ', key, vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload)))).toEqual({ kind: 'provider_unavailable' })
    expect(log).toHaveBeenCalledWith('Finnhub quote failure', expect.objectContaining({ category: 'validation_error', symbol: 'QQQ' }))
    expect(JSON.stringify(log.mock.calls)).not.toContain(key)
  })

  it('identifies Finnhub empty quotes, with or without a timestamp, as not found', async () => {
    const payload = { c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 }
    for (const t of [0, 1792180800]) for (const change of [0, null]) expect(await fetchFinnhubQuote('QQQ', key, vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...payload, t, d: change, dp: change })))).toEqual({ kind: 'not_found' })
  })

  it.each([
    { category: 'network_error', fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error(key)) },
    { category: 'http_error', fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(key, { status: 429 })) },
    { category: 'http_error', fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(key, { status: 201 })) },
    { category: 'validation_error', fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('not json')) },
  ])('logs $category safely and returns a generic failure', async ({ category, fetcher }) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await fetchFinnhubQuote('QQQ', key, fetcher)).toEqual({ kind: 'provider_unavailable' })
    expect(log).toHaveBeenCalledWith('Finnhub quote failure', expect.objectContaining({ category }))
    expect(JSON.stringify(log.mock.calls)).not.toContain(key)
  })

  it('allows a weekend cache miss to fetch while retaining cached weekend prices', () => {
    expect(shouldUseCachedQuote(false, null, '2026-10-18', false)).toBe(false)
    expect(shouldUseCachedQuote(true, '2026-10-16', '2026-10-18', false)).toBe(true)
    expect(shouldUseCachedQuote(true, '2026-10-16', '2026-10-19', true)).toBe(false)
  })
})
