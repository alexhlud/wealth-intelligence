import { describe, expect, it } from 'vitest'
import { canonicalSymbolSchema, quoteSchema } from './contracts'

describe('market-data contracts', () => {
  it('normalizes canonical symbols without accepting provider-shaped values', () => {
    expect(canonicalSymbolSchema.parse(' qqq ')).toBe('QQQ')
    expect(() => canonicalSymbolSchema.parse('QQQ/USD')).toThrow()
  })

  it('requires decimal strings and explicit freshness metadata', () => {
    expect(quoteSchema.parse({
      symbol: 'QQQ', price: '500.12', previousClose: '499.00', change: '1.12', changePercent: '0.2244',
      marketTimestamp: '2026-10-15T20:00:00.000Z', fetchedAt: '2026-10-15T20:05:00.000Z',
      lastSuccessfulAt: '2026-10-15T20:05:00.000Z', source: 'finnhub', freshness: 'fresh',
      delayMinutes: null, unavailableReason: null,
    }).price).toBe('500.12')
    expect(() => quoteSchema.parse({ symbol: 'QQQ', price: 500 })).toThrow()
  })
})
