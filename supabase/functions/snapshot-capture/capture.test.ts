import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getXnysSession, type XnysSession } from '../market-data/xnys-calendar.ts'
import { capturePortfolio } from './capture.ts'

const { buildSnapshot } = vi.hoisted(() => ({ buildSnapshot: vi.fn() }))
vi.mock('../market-data/snapshot.ts', () => ({ buildSnapshot }))

const portfolio = { id: 'portfolio-a', user_id: 'user-a' }
const session = getXnysSession('2026-11-20') as XnysSession
const storageError = { code: 'PGRST000', message: 'connection reset' }

type Lookup = 'previous' | 'pending' | 'existing'

/**
 * Fake admin client. The previous capture is two sessions back, so one missed
 * session (2026-11-19) is looked up. `failing` makes one lookup error.
 */
function fakeAdmin(failing: Lookup | null) {
  const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => {
    return Promise.resolve({ data: 'snapshot-id', error: null })
  })
  const admin = {
    rpc,
    from(table: string) {
      const filters: string[] = []
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'not', 'order', 'limit']) {
        builder[method] = () => builder
      }
      builder.is = (column: string) => {
        filters.push(column)
        return builder
      }
      builder.maybeSingle = () => {
        const lookup: Lookup = table === 'portfolio_snapshots'
          ? 'existing'
          : filters.includes('as_of_date') ? 'pending' : 'previous'
        if (lookup === failing) {
          return Promise.resolve({ data: null, error: storageError })
        }
        if (lookup === 'previous') {
          return Promise.resolve({ data: { as_of_date: '2026-11-18' }, error: null })
        }
        if (lookup === 'existing') {
          return Promise.resolve({ data: { id: 'existing' }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      }
      return builder
    },
  }
  return { admin: admin as unknown as SupabaseClient, rpc }
}

function rpcNames(rpc: ReturnType<typeof fakeAdmin>['rpc']) {
  return rpc.mock.calls.map(([name]) => name)
}

describe('capturePortfolio lookup failures', () => {
  let errorLog: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    buildSnapshot.mockResolvedValue({
      result: { kind: 'ready', session },
      payload: { positions: [], manualAssets: [], liabilities: [] },
    })
  })

  afterEach(() => {
    errorLog.mockRestore()
    buildSnapshot.mockReset()
  })

  it.each([
    ['previous', 'read_previous_capture'],
    ['pending', 'read_pending_capture'],
    ['existing', 'read_missed_session_snapshot'],
  ] as const)('records a storage gap when the %s lookup fails', async (lookup, operation) => {
    const { admin, rpc } = fakeAdmin(lookup)

    const outcome = await capturePortfolio(admin, portfolio, session, 'key')

    expect(outcome).toEqual({ status: 'gap', storageFailure: true })
    expect(rpcNames(rpc)).not.toContain('create_scheduled_portfolio_snapshot')
    expect(buildSnapshot).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenLastCalledWith('record_snapshot_capture_session', {
      p_user_id: 'user-a',
      p_portfolio_id: 'portfolio-a',
      p_as_of_date: '2026-11-20',
      p_reason: 'daily_close',
      p_status: 'gap',
      p_failure_category: 'storage_unavailable',
    })
    expect(errorLog).toHaveBeenCalledWith('Snapshot capture worker failure', {
      operation,
      errorClass: 'object',
      code: 'PGRST000',
      message: 'connection reset',
    })
  })

  it('captures normally when every lookup succeeds', async () => {
    const { admin, rpc } = fakeAdmin(null)

    const outcome = await capturePortfolio(admin, portfolio, session, 'key')

    expect(outcome).toEqual({ status: 'captured', storageFailure: false })
    expect(rpcNames(rpc)).toEqual([
      'create_scheduled_portfolio_snapshot',
      'record_snapshot_capture_session',
    ])
    expect(errorLog).not.toHaveBeenCalled()
  })
})
