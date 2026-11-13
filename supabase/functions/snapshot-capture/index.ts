import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import {
  getCurrentQuoteCaptureSession,
  getSessionsAfter,
} from '../market-data/xnys-calendar.ts'
import { buildSnapshot } from '../market-data/snapshot.ts'
import {
  response,
  responseForCaptureSession,
  responseForCaptureResults,
} from './response.ts'
import {
  expectedPortfoliosAreSatisfied,
  shouldLoadNextPortfolioPage,
} from './health.ts'

const projectUrl = Deno.env.get('SUPABASE_URL') ?? ''
const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY') ?? ''
const schedulerSecret = Deno.env.get('SNAPSHOT_CAPTURE_SCHEDULER_SECRET') ?? ''
const portfolioPageSize = 100

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

export {
  response,
  responseForCaptureSession,
  responseForCaptureResults,
}

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

function createAdminClient(serviceKey: ServiceKey) {
  if (!projectUrl || !serviceKey.value) {
    return null
  }

  return createClient(projectUrl, serviceKey.value, {
    db: { schema: 'app' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function recordRejectedAuthorization(diagnostics: AuthDiagnostics) {
  const serviceKey = readServiceKey()
  const admin = createAdminClient(serviceKey)

  if (!admin) {
    logFailure('record_scheduler_auth_failure', new Error('service client unavailable'))
    return
  }

  const { error } = await admin.rpc('record_scheduler_auth_failure', {
    p_method: diagnostics.method,
    p_secret_length: diagnostics.secretLength,
    p_token_matched: diagnostics.tokenMatched,
    p_origin_matched: diagnostics.originMatchesProject,
  })

  if (error) {
    logFailure('record_scheduler_auth_failure', error)
  }
}

async function recordInvocation(
  admin: ReturnType<typeof createAdminClient>,
  captured: boolean,
) {
  if (!admin) {
    logFailure('record_scheduler_invocation', new Error('service client unavailable'))
    return
  }

  const { error } = await admin.rpc('record_scheduler_invocation', {
    p_captured: captured,
  })

  if (error) {
    logFailure('record_scheduler_invocation', error)
  }
}

async function hasCapturedEveryPortfolio(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  expectedPortfolioIds: string[],
  asOfDate: string,
  marketCloseAt: string,
) {
  if (!expectedPortfolioIds.length) {
    return true
  }

  const { data, error } = await admin
    .from('portfolio_snapshots')
    .select('portfolio_id')
    .in('portfolio_id', expectedPortfolioIds)
    .eq('market_close_at', marketCloseAt)
    .is('corrects_snapshot_id', null)

  if (error) {
    logFailure('verify_scheduler_capture', error)
    return false
  }

  const { data: skipped, error: skippedError } = await admin
    .from('snapshot_capture_requests')
    .select('portfolio_id')
    .in('portfolio_id', expectedPortfolioIds)
    .eq('as_of_date', asOfDate)
    .eq('status', 'skipped')

  if (skippedError) {
    logFailure('verify_scheduler_skips', skippedError)
    return false
  }

  return expectedPortfoliosAreSatisfied(
    expectedPortfolioIds,
    data?.map((snapshot) => snapshot.portfolio_id) ?? [],
    skipped?.map((request) => request.portfolio_id) ?? [],
  )
}

async function portfolioHasEligibleFacts(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  portfolio: { id: string; user_id: string },
) {
  const [positions, manualAssets, liabilities] = await Promise.all([
    admin
      .from('positions')
      .select('id')
      .eq('portfolio_id', portfolio.id)
      .eq('user_id', portfolio.user_id)
      .eq('status', 'open')
      .limit(1),
    admin
      .from('manual_assets')
      .select('id')
      .eq('portfolio_id', portfolio.id)
      .eq('user_id', portfolio.user_id)
      .limit(1),
    admin
      .from('liabilities')
      .select('id')
      .eq('portfolio_id', portfolio.id)
      .eq('user_id', portfolio.user_id)
      .limit(1),
  ])

  if (positions.error || manualAssets.error || liabilities.error) {
    throw positions.error ?? manualAssets.error ?? liabilities.error
  }

  return Boolean(
    positions.data?.length || manualAssets.data?.length || liabilities.data?.length,
  )
}

export async function handler(request: Request) {
  const diagnostics = authorizationDiagnostics(request)

  if (!authorized(diagnostics)) {
    logRejectedAuthorization(diagnostics)
    await recordRejectedAuthorization(diagnostics)
    return response(401)
  }

  const serviceKey = readServiceKey()
  const admin = createAdminClient(serviceKey)

  async function finish(result: Response, captured: boolean) {
    await recordInvocation(admin, captured)
    return result
  }

  console.info('Snapshot capture worker started', {
    serviceKeySource: serviceKey.source,
  })

  if (!projectUrl || !serviceKey.value || !finnhubApiKey || !admin) {
    console.error('Snapshot capture worker configuration unavailable', {
      missingProjectUrl: !projectUrl,
      missingServiceKey: !serviceKey.value,
      missingFinnhubApiKey: !finnhubApiKey,
      serviceKeySource: serviceKey.source,
    })
    return finish(response(503), false)
  }

  const session = getCurrentQuoteCaptureSession()

  const noSessionResponse = responseForCaptureSession(session)

  if (session.kind !== 'session') {
    return finish(noSessionResponse!, false)
  }

  let lastPortfolioId: string | null = null
  let foundPortfolio = false
  let processedPortfolioCount = 0
  let gapPortfolioCount = 0
  const expectedPortfolioIds: string[] = []
  let captureFailure = false

  while (true) {
    let query = admin
      .from('portfolios')
      .select('id,user_id')
      .order('id', { ascending: true })
      .limit(portfolioPageSize)

    if (lastPortfolioId) {
      query = query.gt('id', lastPortfolioId)
    }

    const { data: portfolios, error } = await query

    logPortfolioQuery(serviceKey.source, portfolios, error)

    if (error) {
      logFailure('list_portfolios', error)
      return finish(response(503), false)
    }

    if (!portfolios?.length) {
      break
    }

    foundPortfolio = true
    lastPortfolioId = portfolios.at(-1)!.id

    for (const portfolio of portfolios) {
      try {
        if (await portfolioHasEligibleFacts(admin, portfolio)) {
          expectedPortfolioIds.push(portfolio.id)
        }

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
            const recorded = await admin.rpc('record_snapshot_capture_session', {
              p_user_id: portfolio.user_id,
              p_portfolio_id: portfolio.id,
              p_as_of_date: missed.asOfDate,
              p_reason: 'daily_close',
              p_status: 'gap',
              p_failure_category: 'outside_capture_window',
            })

            if (recorded.error) {
              throw recorded.error
            }
          }
        }

        const built = await buildSnapshot(
          admin,
          portfolio.user_id,
          portfolio.id,
          finnhubApiKey,
        )

        let status: 'captured' | 'gap' | 'skipped'

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

          status = 'captured'
        } else if (built.result.kind === 'already_recorded') {
          status = 'captured'
        } else {
          status = built.result.reason === 'no_eligible_facts' ? 'skipped' : 'gap'
        }

        const failure = built.result.kind === 'unavailable'
          && built.result.reason === 'price_unavailable'
          ? 'price_unavailable'
          : built.result.kind === 'unavailable'
            && built.result.reason === 'state_changed_after_close'
            ? 'state_changed_after_close'
            : 'outside_capture_window'
        const recorded = await admin.rpc('record_snapshot_capture_session', {
          p_user_id: portfolio.user_id,
          p_portfolio_id: portfolio.id,
          p_as_of_date: session.asOfDate,
          p_reason: reason,
          p_status: status,
          p_failure_category: status === 'gap' ? failure : null,
        })

        if (recorded.error) {
          throw recorded.error
        }

        processedPortfolioCount += 1
        gapPortfolioCount += status === 'gap' ? 1 : 0
      } catch (failure) {
        captureFailure = true
        logFailure('capture_portfolio', failure)
      }
    }

    if (!shouldLoadNextPortfolioPage(portfolios.length, portfolioPageSize)) {
      break
    }
  }

  if (!foundPortfolio) {
    console.error('Snapshot capture no portfolios visible', {
      serviceKeySource: serviceKey.source,
      portfolioCount: 0,
    })
    return finish(response(503), false)
  }

  const captured = !captureFailure && await hasCapturedEveryPortfolio(
    admin,
    expectedPortfolioIds,
    session.asOfDate,
    session.marketCloseAt,
  )

  return finish(
    responseForCaptureResults(processedPortfolioCount, gapPortfolioCount),
    captured,
  )
}

if (import.meta.main) {
  Deno.serve(handler)
}
