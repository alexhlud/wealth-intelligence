import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { z } from 'npm:zod@4.4.3'

const symbolsSchema = z.object({
  operation: z.literal('quotes'),
  symbols: z.array(z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,9}$/)).min(1).max(25),
}).transform(({ operation, symbols }) => ({ operation, symbols: [...new Set(symbols)] }))

const finnhubQuoteSchema = z.object({
  c: z.number().finite().nonnegative(), d: z.number().finite(), dp: z.number().finite(), pc: z.number().finite().nonnegative(), t: z.number().int().nonnegative(),
})

const projectUrl = Deno.env.get('SUPABASE_URL') ?? ''
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY') ?? ''
const allowedOrigins = (Deno.env.get('MARKET_DATA_ALLOWED_ORIGINS') ?? 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean)

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin')
  return origin && allowedOrigins.includes(origin)
    ? { 'access-control-allow-origin': origin, 'vary': 'Origin', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' }
    : { 'vary': 'Origin' }
}

function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) })
}

function asDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Invalid decimal')
  return value.toString()
}

function newYorkTradingDay(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function isNewYorkTradingDay(value = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(value)
  return weekday !== 'Sat' && weekday !== 'Sun'
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Request could not be processed.' }, 405)
  if (!projectUrl || !publishableKey || !serviceRoleKey || !finnhubApiKey) return json(request, { error: 'Service is unavailable.' }, 503)
  if (request.headers.get('origin') && !allowedOrigins.includes(request.headers.get('origin')!)) return json(request, { error: 'Request could not be processed.' }, 403)

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(request, { error: 'Authentication required.' }, 401)
  const authClient = createClient(projectUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user }, error: authError } = await authClient.auth.getUser(token)
  if (authError || !user) return json(request, { error: 'Authentication required.' }, 401)

  const body = symbolsSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return json(request, { error: 'Request could not be processed.' }, 400)
  const admin = createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const windowStartedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
  const { data: existing } = await admin.from('market_data_refresh_rate_windows').select('request_count').eq('user_id', user.id).eq('window_started_at', windowStartedAt).maybeSingle()
  if ((existing?.request_count ?? 0) >= 10) return json(request, { error: 'Please try again later.' }, 429)
  await admin.from('market_data_refresh_rate_windows').upsert({ user_id: user.id, window_started_at: windowStartedAt, request_count: (existing?.request_count ?? 0) + 1 })

  const now = new Date().toISOString()
  const tradingDay = newYorkTradingDay()
  const results = await Promise.all(body.data.symbols.map(async (symbol) => {
    const { data: cached } = await admin.from('quote_cache').select('*').eq('provider', 'finnhub').eq('market', 'us_equities').eq('symbol', symbol).maybeSingle()
    const fetchedDay = cached ? newYorkTradingDay(new Date(cached.fetched_at)) : null
    if (cached && (fetchedDay === tradingDay || !isNewYorkTradingDay())) return { symbol, price: String(cached.price), previousClose: String(cached.previous_close), change: String(cached.change), changePercent: String(cached.change_percent), marketTimestamp: cached.provider_timestamp, fetchedAt: cached.fetched_at, lastSuccessfulAt: cached.last_successful_at, source: 'finnhub', freshness: fetchedDay === tradingDay ? 'fresh' : 'stale', delayMinutes: cached.delay_minutes, unavailableReason: null }
    if (!isNewYorkTradingDay()) return { symbol, price: null, previousClose: null, change: null, changePercent: null, marketTimestamp: null, fetchedAt: now, lastSuccessfulAt: null, source: 'finnhub', freshness: 'unavailable', delayMinutes: null, unavailableReason: 'provider_unavailable' }
    try {
      const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubApiKey)}`, { signal: AbortSignal.timeout(8_000) })
      if (!response.ok) throw new Error('Provider unavailable')
      const parsed = finnhubQuoteSchema.safeParse(await response.json())
      if (!parsed.success || parsed.data.t === 0) return { symbol, price: null, previousClose: null, change: null, changePercent: null, marketTimestamp: null, fetchedAt: now, lastSuccessfulAt: null, source: 'finnhub', freshness: 'unavailable', delayMinutes: null, unavailableReason: 'unsupported_symbol' }
      const quote = parsed.data
      const row = { provider: 'finnhub', market: 'us_equities', symbol, price: asDecimal(quote.c), previous_close: asDecimal(quote.pc), change: asDecimal(quote.d), change_percent: asDecimal(quote.dp), provider_timestamp: new Date(quote.t * 1000).toISOString(), fetched_at: now, last_successful_at: now, delay_minutes: null, source_version: 'finnhub-v1', updated_at: now }
      await admin.from('quote_cache').upsert(row)
      return { symbol, price: row.price, previousClose: row.previous_close, change: row.change, changePercent: row.change_percent, marketTimestamp: row.provider_timestamp, fetchedAt: now, lastSuccessfulAt: now, source: 'finnhub', freshness: 'fresh', delayMinutes: null, unavailableReason: null }
    } catch {
      if (cached) return { symbol, price: String(cached.price), previousClose: String(cached.previous_close), change: String(cached.change), changePercent: String(cached.change_percent), marketTimestamp: cached.provider_timestamp, fetchedAt: now, lastSuccessfulAt: cached.last_successful_at, source: 'finnhub', freshness: 'stale', delayMinutes: cached.delay_minutes, unavailableReason: null }
      return { symbol, price: null, previousClose: null, change: null, changePercent: null, marketTimestamp: null, fetchedAt: now, lastSuccessfulAt: null, source: 'finnhub', freshness: 'unavailable', delayMinutes: null, unavailableReason: 'provider_unavailable' }
    }
  }))
  return json(request, { quotes: results })
})
