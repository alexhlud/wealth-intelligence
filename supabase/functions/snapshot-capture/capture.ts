import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { buildSnapshot } from '../market-data/snapshot.ts'
import { getSessionsAfter, type XnysSession } from '../market-data/xnys-calendar.ts'
import { logFailure } from './log.ts'

export type CaptureStatus = 'captured' | 'gap' | 'skipped'

type Portfolio = { id: string; user_id: string }

/** A worker read that failed. The portfolio is recorded as a storage gap. */
class LookupFailure extends Error {
  constructor(readonly operation: string, readonly cause: unknown) {
    super(operation)
    this.name = 'LookupFailure'
  }
}

/** Returns the lookup's data, or throws a LookupFailure when it errored. */
function checked<T>(
  operation: string,
  result: { data: T; error: unknown },
): T {
  if (result.error) {
    throw new LookupFailure(operation, result.error)
  }
  return result.data
}

async function recordSession(
  admin: SupabaseClient,
  portfolio: Portfolio,
  asOfDate: string,
  reason: 'daily_close' | 'position_change',
  status: CaptureStatus,
  failureCategory: string | null,
) {
  const recorded = await admin.rpc('record_snapshot_capture_session', {
    p_user_id: portfolio.user_id,
    p_portfolio_id: portfolio.id,
    p_as_of_date: asOfDate,
    p_reason: reason,
    p_status: status,
    p_failure_category: failureCategory,
  })

  if (recorded.error) {
    throw recorded.error
  }
}

async function captureAfterLookups(
  admin: SupabaseClient,
  portfolio: Portfolio,
  session: XnysSession,
  apiKey: string,
): Promise<CaptureStatus> {
  const previous = checked('read_previous_capture', await admin
    .from('snapshot_capture_requests')
    .select('as_of_date')
    .eq('portfolio_id', portfolio.id)
    .not('as_of_date', 'is', null)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle())
  const pending = checked('read_pending_capture', await admin
    .from('snapshot_capture_requests')
    .select('reason')
    .eq('portfolio_id', portfolio.id)
    .is('as_of_date', null)
    .eq('status', 'pending')
    .maybeSingle())
  const reason = pending?.reason === 'position_change'
    ? 'position_change'
    : 'daily_close'

  for (const missed of getSessionsAfter(
    previous?.as_of_date ?? null,
    session.asOfDate,
  )) {
    const existing = checked('read_missed_session_snapshot', await admin
      .from('portfolio_snapshots')
      .select('id')
      .eq('portfolio_id', portfolio.id)
      .eq('market_close_at', missed.marketCloseAt)
      .is('corrects_snapshot_id', null)
      .maybeSingle())

    if (!existing) {
      await recordSession(
        admin,
        portfolio,
        missed.asOfDate,
        'daily_close',
        'gap',
        'outside_capture_window',
      )
    }
  }

  const built = await buildSnapshot(admin, portfolio.user_id, portfolio.id, apiKey)

  let status: CaptureStatus

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

  await recordSession(
    admin,
    portfolio,
    session.asOfDate,
    reason,
    status,
    status === 'gap' ? failure : null,
  )

  return status
}

export type CaptureOutcome = {
  status: CaptureStatus
  /** True when a worker read failed and the portfolio became a storage gap. */
  storageFailure: boolean
}

/**
 * Captures one portfolio for the session. When a lookup fails, the failure is
 * logged (class, code, redacted message), the session is recorded as a
 * storage gap for this portfolio, and no snapshot is written. Any other
 * failure propagates to the caller, as before.
 */
export async function capturePortfolio(
  admin: SupabaseClient,
  portfolio: Portfolio,
  session: XnysSession,
  apiKey: string,
): Promise<CaptureOutcome> {
  try {
    const status = await captureAfterLookups(admin, portfolio, session, apiKey)
    return { status, storageFailure: false }
  } catch (error) {
    if (!(error instanceof LookupFailure)) {
      throw error
    }
    logFailure(error.operation, error.cause)
    await recordSession(
      admin,
      portfolio,
      session.asOfDate,
      'daily_close',
      'gap',
      'storage_unavailable',
    )
    return { status: 'gap', storageFailure: true }
  }
}
