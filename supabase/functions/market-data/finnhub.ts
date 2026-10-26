import { z } from 'zod'

export const quoteRequestSchema = z.object({
  operation: z.literal('quotes'),
  symbols: z.array(z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,9}$/)).min(1).max(25),
}).strict().transform(({ operation, symbols }) => ({ operation, symbols: [...new Set(symbols)] }))

export const snapshotPreviewRequestSchema = z.object({
  operation: z.literal('snapshot_preview'),
  portfolioId: z.string().uuid(),
}).strict()

export const saveSnapshotRequestSchema = z.object({
  operation: z.literal('save_snapshot'),
  portfolioId: z.string().uuid(),
  requestId: z.string().uuid(),
}).strict()

/** Resolves an XNYS session only; it deliberately never requests a historical quote. */
export const historicalSessionRequestSchema = z.object({
  operation: z.literal('historical_session'),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict()

export const marketDataRequestSchema = z.union([
  quoteRequestSchema,
  snapshotPreviewRequestSchema,
  saveSnapshotRequestSchema,
  historicalSessionRequestSchema,
])

const quoteSchema = z.object({
  c: z.number().finite().nonnegative(),
  pc: z.number().finite().nonnegative(),
  d: z.number().finite(),
  dp: z.number().finite(),
  t: z.number().int().nonnegative().max(8_640_000_000_000),
})

const emptyQuoteSchema = z.object({
  c: z.literal(0), pc: z.literal(0),
  d: z.union([z.literal(0), z.null()]), dp: z.union([z.literal(0), z.null()]),
  t: z.number().int().nonnegative().max(8_640_000_000_000),
})

const decimalSchema = z.string().regex(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,12})?$/)

// Expand exponent notation without performing arithmetic on financial values.
function decimal(value: number): string {
  const [mantissa, exponentText] = value.toString().split('e')
  if (!exponentText) return decimalSchema.parse(mantissa)
  const negative = mantissa.startsWith('-')
  const unsigned = negative ? mantissa.slice(1) : mantissa
  const [integer, fraction = ''] = unsigned.split('.')
  const digits = integer + fraction
  const point = integer.length + Number(exponentText)
  const expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length ? `${digits}${'0'.repeat(point - digits.length)}`
      : `${digits.slice(0, point)}.${digits.slice(point)}`
  return decimalSchema.parse(`${negative ? '-' : ''}${expanded}`)
}

export type FinnhubResult =
  | { kind: 'quote'; price: string; previousClose: string; change: string; changePercent: string; marketTimestamp: string }
  | { kind: 'not_found' }
  | { kind: 'provider_unavailable' }

export async function fetchFinnhubQuote(symbol: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<FinnhubResult> {
  let response: Response
  try {
    response = await fetcher(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(8_000) })
  } catch (error) {
    console.error('Finnhub quote failure', { category: 'network_error', symbol, timeout: error instanceof Error && error.name === 'TimeoutError' })
    return { kind: 'provider_unavailable' }
  }
  if (response.status !== 200) {
    console.error('Finnhub quote failure', { category: 'http_error', symbol, status: response.status })
    return { kind: 'provider_unavailable' }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    console.error('Finnhub quote failure', { category: 'validation_error', symbol, reason: 'invalid_json' })
    return { kind: 'provider_unavailable' }
  }
  // Finnhub's empty result can contain null change fields and a nonzero timestamp.
  if (emptyQuoteSchema.safeParse(payload).success) return { kind: 'not_found' }
  const parsed = quoteSchema.safeParse(payload)
  if (!parsed.success) {
    console.error('Finnhub quote failure', { category: 'validation_error', symbol, issues: parsed.error.issues.map(({ path, code }) => ({ field: String(path[0] ?? ''), code })) })
    return { kind: 'provider_unavailable' }
  }
  const quote = parsed.data
  if (quote.t === 0) return { kind: 'provider_unavailable' }
  try {
    return { kind: 'quote', price: decimal(quote.c), previousClose: decimal(quote.pc), change: decimal(quote.d), changePercent: decimal(quote.dp), marketTimestamp: new Date(quote.t * 1000).toISOString() }
  } catch {
    console.error('Finnhub quote failure', { category: 'validation_error', symbol, reason: 'decimal_or_timestamp_out_of_range' })
    return { kind: 'provider_unavailable' }
  }
}

export function shouldUseCachedQuote(cached: boolean, fetchedDay: string | null, tradingDay: string, isTradingDay: boolean): boolean {
  return cached && (fetchedDay === tradingDay || !isTradingDay)
}
