import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import {
  getCurrentQuoteCaptureSession,
  getSessionsAfter,
} from '../market-data/xnys-calendar.ts'
import { buildSnapshot } from '../market-data/snapshot.ts'
import {
  response,
  responseForCaptureSession,
} from './response.ts'

const projectUrl = Deno.env.get('SUPABASE_URL') ?? ''
const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY') ?? ''
const schedulerSecret = Deno.env.get('SNAPSHOT_CAPTURE_SCHEDULER_SECRET') ?? ''
const batchSize = 20

type AuthDiagnostics = {
  method: string
  secretLength: number
  tokenMatched: boolean
  originMatchesProject: boolean
}

type ServiceKey = {
  source: 'SUPABASE_SECRET_KEYS' | 'SUPABASE_SERVICE_ROLE_KEY' | 'missing'
  value: string
}

export { response, responseForCaptureSession }

function readServiceKey(): ServiceKey {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')

  if (secretKeys !== undefined) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>
      const value = parsed.default

      if (typeof value === 'string' && value) {
        return { source: 'SUPABASE_SECRET_KEYS', value }
      }

      console.error('Snapshot capture worker configuration failure', {
        reason: 'secret_key_default_missing',
        serviceKeySource: 'SUPABASE_SECRET_KEYS',
      })
      return { source: 'missing', value: '' }
    } catch (error) {
      logFailure('read_secret_keys', error)
      return { source: 'missing', value: '' }
    }
  }

  const legacyServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (legacyServiceRoleKey) {
    return { source: 'SUPABASE_SERVICE_ROLE_KEY', value: legacyServiceRoleKey }
  }

  console.error('Snapshot capture worker configuration failure', {
    reason: 'service_key_missing',
    serviceKeySource: 'missing',
  })
  return { source: 'missing', value: '' }
}

function originMatchesProject(request: Request) {
  try {
    return new URL(request.url).origin === new URL(projectUrl).origin
  } catch {
    return false
  }
}

function authorizationDiagnostics(request: Request): AuthDiagnostics {
  const token = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')

  return {
    method: request.method,
    secretLength: schedulerSecret.length,
    tokenMatched: token === schedulerSecret,
    originMatchesProject: originMatchesProject(request),
  }
}

function authorized(diagnostics: AuthDiagnostics) {
  return diagnostics.method === 'POST'
    && diagnostics.secretLength >= 32
    && diagnostics.tokenMatched
}

function logRejectedAuthorization(diagnostics: AuthDiagnostics) {
  console.error('Snapshot capture authorization rejected', diagnostics)
}

function logFailure(operation: string, error: unknown) {
  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {}

  console.error('Snapshot capture worker failure', {
    operation,
    errorClass: error instanceof Error ? error.name : typeof error,
    code: typeof record.code === 'string' ? record.code : undefined,
    message: String(record.message ?? error)
      .replace(/\d+(?:\.\d+)?/g, '[redacted-number]')
      .slice(0, 180),
  })
}

function logPortfolioQuery(
  serviceKeySource: ServiceKey['source'],
  portfolios: { id: string; user_id: string }[] | null,
  error: unknown,
) {
  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {}

  console.info('Snapshot capture portfolio query', {
    serviceKeySource,
    portfolioCount: portfolios?.length ?? 0,
    error: error
      ? {
        errorClass: error instanceof Error ? error.name : typeof error,
        code: typeof record.code === 'string' ? record.code : undefined,
        message: String(record.message ?? error)
          .replace(/\d+(?:\.\d+)?/g, '[redacted-number]')
          .slice(0, 180),
      }
      : null,
  })
}

export async function handler(request: Request) {
  const diagnostics = authorizationDiagnostics(request)

  if (!authorized(diagnostics)) {
    logRejectedAuthorization(diagnostics)
    return response(401)
  }

  const serviceKey = readServiceKey()

  console.info('Snapshot capture worker started', {
    serviceKeySource: serviceKey.source,
  })

  if (!projectUrl || !serviceKey.value || !finnhubApiKey) {
    console.error('Snapshot capture worker configuration unavailable', {
      missingProjectUrl: !projectUrl,
      missingServiceKey: !serviceKey.value,
      missingFinnhubApiKey: !finnhubApiKey,
      serviceKeySource: serviceKey.source,
    })
    return response(503)
  }

  const session = getCurrentQuoteCaptureSession()

  const noSessionResponse = responseForCaptureSession(session)

  if (session.kind !== 'session') {
    return noSessionResponse!
  }

  const admin = createClient(projectUrl, serviceKey.value, {
    db: { schema: 'app' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: portfolios, error } = await admin
    .from('portfolios')
    .select('id,user_id')
    .limit(batchSize)

  logPortfolioQuery(serviceKey.source, portfolios, error)

  if (error) {
    logFailure('list_portfolios', error)
    return response(503)
  }

  if (!portfolios?.length) {
    console.error('Snapshot capture no portfolios visible', {
      serviceKeySource: serviceKey.source,
      portfolioCount: 0,
    })
    return response(503)
  }

  for (const portfolio of portfolios ?? []) {
    try {
      const { data: previous } = await admin
        .from('snapshot_capture_requests')
        .select('as_of_date')
        .eq('portfolio_id', portfolio.id)
        .not('as_of_date', 'is', null)
        .order('as_of_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      const { data: pending } = await admin
        .from('snapshot_capture_requests')
        .select('reason')
        .eq('portfolio_id', portfolio.id)
        .is('as_of_date', null)
        .eq('status', 'pending')
        .maybeSingle()
      const reason = pending?.reason === 'position_change'
        ? 'position_change'
        : 'daily_close'

      for (const missed of getSessionsAfter(
        previous?.as_of_date ?? null,
        session.asOfDate,
      )) {
        const { data: existing } = await admin
          .from('portfolio_snapshots')
          .select('id')
          .eq('portfolio_id', portfolio.id)
          .eq('market_close_at', missed.marketCloseAt)
          .is('corrects_snapshot_id', null)
          .maybeSingle()

        if (!existing) {
          await admin.rpc('record_snapshot_capture_session', {
            p_user_id: portfolio.user_id,
            p_portfolio_id: portfolio.id,
            p_as_of_date: missed.asOfDate,
            p_reason: 'daily_close',
            p_status: 'gap',
            p_failure_category: 'outside_capture_window',
          })
        }
      }

      const built = await buildSnapshot(
        admin,
        portfolio.user_id,
        portfolio.id,
        finnhubApiKey,
      )

      if (built.result.kind === 'ready' && built.payload) {
        const saved = await admin.rpc('create_scheduled_portfolio_snapshot', {
          p_user_id: portfolio.user_id,
          p_portfolio_id: portfolio.id,
          p_as_of_date: session.asOfDate,
          p_market_close_at: session.marketCloseAt,
          p_source: reason,
          p_positions: built.payload.positions,
          p_manual_assets: built.payload.manualAssets,
          p_liabilities: built.payload.liabilities,
          p_request_id: crypto.randomUUID(),
        })

        if (saved.error) {
          throw saved.error
        }

        await admin.rpc('record_snapshot_capture_session', {
          p_user_id: portfolio.user_id,
          p_portfolio_id: portfolio.id,
          p_as_of_date: session.asOfDate,
          p_reason: reason,
          p_status: 'captured',
          p_failure_category: null,
        })
      } else if (built.result.kind === 'already_recorded') {
        await admin.rpc('record_snapshot_capture_session', {
          p_user_id: portfolio.user_id,
          p_portfolio_id: portfolio.id,
          p_as_of_date: session.asOfDate,
          p_reason: reason,
          p_status: 'captured',
          p_failure_category: null,
        })
      } else if (built.result.kind !== 'already_recorded') {
        const failure = built.result.reason === 'price_unavailable'
          ? 'price_unavailable'
          : built.result.reason === 'state_changed_after_close'
            ? 'state_changed_after_close'
            : 'outside_capture_window'
        const status = built.result.reason === 'no_eligible_facts'
          ? 'skipped'
          : 'gap'

        await admin.rpc('record_snapshot_capture_session', {
          p_user_id: portfolio.user_id,
          p_portfolio_id: portfolio.id,
          p_as_of_date: session.asOfDate,
          p_reason: reason,
          p_status: status,
          p_failure_category: status === 'gap' ? failure : null,
        })
      }
    } catch (failure) {
      logFailure('capture_portfolio', failure)
    }
  }

  return response(200)
}

if (import.meta.main) {
  Deno.serve(handler)
}
