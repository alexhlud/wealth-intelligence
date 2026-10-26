import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { fetchFinnhubQuote, marketDataRequestSchema, shouldUseCachedQuote } from './finnhub.ts'
import { corsHeaders, corsPreflight, parseAllowedOrigins } from './cors.ts'
import { previewSnapshot, saveSnapshot } from './snapshot.ts'
import { getXnysSession } from './xnys-calendar.ts'

const projectUrl = Deno.env.get('SUPABASE_URL') ?? ''
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY') ?? ''
const allowedOrigins = parseAllowedOrigins(Deno.env.get('MARKET_DATA_ALLOWED_ORIGINS'))

function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request, allowedOrigins) })
}

function tokenAssuranceLevel(token: string): 'aal1' | 'aal2' | 'unknown' {
  try {
    const payload = token.split('.')[1]
    if (!payload) return 'unknown'
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const { aal } = JSON.parse(json) as { aal?: unknown }
    return aal === 'aal1' || aal === 'aal2' ? aal : 'unknown'
  } catch {
    return 'unknown'
  }
}

function snapshotFailure(error: unknown, operation: 'preview' | 'save', assuranceLevel?: 'aal1' | 'aal2' | 'unknown') {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const message = typeof record.message === 'string' ? record.message : String(error)
  const code = typeof record.code === 'string' ? record.code : undefined
  // Error messages can come from provider/database layers. Preserve their
  // diagnostic shape without allowing values or credentials into logs.
  const safeMessage = message
    .replace(/(token|key|authorization)=\S+/gi, '$1=[redacted]')
    .replace(/-?\d+(?:\.\d+)?/g, '[redacted-number]')
    .slice(0, 240)
  const errorClass = error instanceof Error ? error.name : error === null ? 'null' : typeof error
  console.error('Snapshot capture failure', { operation, errorClass, message: safeMessage, code, assuranceLevel })
  return { code, message }
}

function isMfaRequired(error: { code?: string; message: string }) {
  return error.code === '42501' && error.message === 'MFA verification required'
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
  if (request.method === 'OPTIONS') return corsPreflight(request, allowedOrigins)
  if (request.method !== 'POST') return json(request, { error: 'Request could not be processed.' }, 405)
  if (!projectUrl || !publishableKey || !serviceRoleKey || !finnhubApiKey) return json(request, { error: 'Service is unavailable.' }, 503)
  if (request.headers.get('origin') && !allowedOrigins.includes(request.headers.get('origin')!)) return json(request, { error: 'Request could not be processed.' }, 403)

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(request, { error: 'Authentication required.' }, 401)
  const authClient = createClient(projectUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user }, error: authError } = await authClient.auth.getUser(token)
  if (authError || !user) return json(request, { error: 'Authentication required.' }, 401)
  const assuranceLevel = tokenAssuranceLevel(token)

  const body = marketDataRequestSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return json(request, { error: 'Request could not be processed.' }, 400)
  const admin = createClient(projectUrl, serviceRoleKey, { db: { schema: 'app' }, auth: { persistSession: false, autoRefreshToken: false } })
  const windowStartedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
  const { data: existing, error: rateReadError } = await admin.from('market_data_refresh_rate_windows').select('request_count').eq('user_id', user.id).eq('window_started_at', windowStartedAt).maybeSingle()
  if (rateReadError) {
    console.error('Market data storage failure', { operation: 'read_rate_limit', code: rateReadError.code })
    return json(request, { error: 'Service is unavailable.' }, 503)
  }
  if ((existing?.request_count ?? 0) >= 10) return json(request, { error: 'Please try again later.' }, 429)
  const { error: rateWriteError } = await admin.from('market_data_refresh_rate_windows').upsert({ user_id: user.id, window_started_at: windowStartedAt, request_count: (existing?.request_count ?? 0) + 1 })
  if (rateWriteError) {
    console.error('Market data storage failure', { operation: 'write_rate_limit', code: rateWriteError.code })
    return json(request, { error: 'Service is unavailable.' }, 503)
  }

  if (body.data.operation === 'snapshot_preview') {
    try {
      return json(request, { snapshot: await previewSnapshot(admin, user.id, body.data.portfolioId, finnhubApiKey) })
    } catch (error) {
      snapshotFailure(error, 'preview', assuranceLevel)
      return json(request, { error: 'Service is unavailable.' }, 503)
    }
  }
  if (body.data.operation === 'save_snapshot') {
    const userClient = createClient(projectUrl, publishableKey, { db: { schema: 'app' }, global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
    try {
      return json(request, { snapshot: await saveSnapshot(admin, userClient, user.id, body.data.portfolioId, body.data.requestId, finnhubApiKey) })
    } catch (error) {
      const failure = snapshotFailure(error, 'save', assuranceLevel)
      if (isMfaRequired(failure)) return json(request, { error: 'Snapshot save requires verification.', reason: 'mfa_required' }, 403)
      return json(request, { error: 'Service is unavailable.' }, 503)
    }
  }
  if (body.data.operation === 'historical_session') {
    const session = getXnysSession(body.data.asOfDate)
    return json(request, { session })
  }

  const now = new Date().toISOString()
  const tradingDay = newYorkTradingDay()
  const results = await Promise.all(body.data.symbols.map(async (symbol) => {
    const { data: cached, error: cacheReadError } = await admin.from('quote_cache').select('*').eq('provider', 'finnhub').eq('market', 'us_equities').eq('symbol', symbol).maybeSingle()
    if (cacheReadError) {
      console.error('Market data storage failure', { operation: 'read_quote', code: cacheReadError.code })
      return { symbol, price: null, previousClose: null, change: null, changePercent: null, marketTimestamp: null, fetchedAt: now, lastSuccessfulAt: null, source: 'finnhub', freshness: 'unavailable', delayMinutes: null, unavailableReason: 'provider_unavailable' }
    }
    const fetchedDay = cached ? newYorkTradingDay(new Date(cached.fetched_at)) : null
    if (cached && shouldUseCachedQuote(true, fetchedDay, tradingDay, isNewYorkTradingDay())) return { symbol, price: String(cached.price), previousClose: String(cached.previous_close), change: String(cached.change), changePercent: String(cached.change_percent), marketTimestamp: cached.provider_timestamp, fetchedAt: cached.fetched_at, lastSuccessfulAt: cached.last_successful_at, source: 'finnhub', freshness: fetchedDay === tradingDay ? 'fresh' : 'stale', delayMinutes: cached.delay_minutes, unavailableReason: null }
    try {
      const quote = await fetchFinnhubQuote(symbol, finnhubApiKey)
      if (quote.kind === 'not_found' && !cached) return { symbol, price: null, previousClose: null, change: null, changePercent: null, marketTimestamp: null, fetchedAt: now, lastSuccessfulAt: null, source: 'finnhub', freshness: 'unavailable', delayMinutes: null, unavailableReason: 'not_found' }
      if (quote.kind !== 'quote') throw new Error('Quote unavailable')
      const row = { provider: 'finnhub', market: 'us_equities', symbol, price: quote.price, previous_close: quote.previousClose, change: quote.change, change_percent: quote.changePercent, provider_timestamp: quote.marketTimestamp, fetched_at: now, last_successful_at: now, delay_minutes: null, source_version: 'finnhub-v1', updated_at: now }
      const { error: cacheWriteError } = await admin.from('quote_cache').upsert(row)
      if (cacheWriteError) {
        console.error('Market data storage failure', { operation: 'write_quote', code: cacheWriteError.code })
        throw new Error('Quote cache unavailable')
      }
      return { symbol, price: row.price, previousClose: row.previous_close, change: row.change, changePercent: row.change_percent, marketTimestamp: row.provider_timestamp, fetchedAt: now, lastSuccessfulAt: now, source: 'finnhub', freshness: 'fresh', delayMinutes: null, unavailableReason: null }
    } catch {
      if (cached) return { symbol, price: String(cached.price), previousClose: String(cached.previous_close), change: String(cached.change), changePercent: String(cached.change_percent), marketTimestamp: cached.provider_timestamp, fetchedAt: now, lastSuccessfulAt: cached.last_successful_at, source: 'finnhub', freshness: 'stale', delayMinutes: cached.delay_minutes, unavailableReason: null }
      return { symbol, price: null, previousClose: null, change: null, changePercent: null, marketTimestamp: null, fetchedAt: now, lastSuccessfulAt: null, source: 'finnhub', freshness: 'unavailable', delayMinutes: null, unavailableReason: 'provider_unavailable' }
    }
  }))
  return json(request, { quotes: results })
})
