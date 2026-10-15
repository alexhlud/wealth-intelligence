import { z } from 'zod'

export const canonicalSymbolSchema = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,9}$/)
export const decimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/)
export const quoteFreshnessSchema = z.enum(['fresh', 'stale', 'delayed', 'unavailable'])
export const quoteUnavailableReasonSchema = z.enum(['unsupported_symbol', 'not_found', 'provider_unavailable', 'invalid_response'])

export const quoteSchema = z.object({
  symbol: canonicalSymbolSchema,
  price: decimalStringSchema.nullable(),
  previousClose: decimalStringSchema.nullable(),
  change: decimalStringSchema.nullable(),
  changePercent: decimalStringSchema.nullable(),
  marketTimestamp: z.string().datetime({ offset: true }).nullable(),
  fetchedAt: z.string().datetime({ offset: true }),
  lastSuccessfulAt: z.string().datetime({ offset: true }).nullable(),
  source: z.literal('finnhub'),
  freshness: quoteFreshnessSchema,
  delayMinutes: z.number().int().nonnegative().nullable(),
  unavailableReason: quoteUnavailableReasonSchema.nullable(),
})

export type Quote = z.infer<typeof quoteSchema>

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<Quote>
  getQuotes(symbols: readonly string[]): Promise<Quote[]>
  searchSymbols(query: string): Promise<never>
  getPreviousClose(symbol: string): Promise<never>
  getHistoricalPrice(symbol: string, date: string): Promise<never>
  getHistoricalSeries(symbol: string, startDate: string, endDate: string): Promise<never>
}
