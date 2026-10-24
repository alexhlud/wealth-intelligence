import { describe, expect, it } from 'vitest'
import { getCurrentQuoteCaptureSession, getXnysSession } from '../../../supabase/functions/market-data/xnys-calendar'

describe('XNYS annual table', () => {
  it('resolves a normal close with the correct DST-aware UTC instant', () => {
    expect(getXnysSession('2026-10-26')).toEqual({ kind: 'session', asOfDate: '2026-10-26', closeTimeEt: '16:00', marketCloseAt: '2026-10-26T20:00:00.000Z' })
  })

  it('resolves an NYSE 1pm early close', () => {
    expect(getXnysSession('2026-11-27')).toEqual({ kind: 'session', asOfDate: '2026-11-27', closeTimeEt: '13:00', marketCloseAt: '2026-11-27T18:00:00.000Z' })
  })

  it('rejects an NYSE holiday', () => {
    expect(getXnysSession('2027-11-25')).toEqual({ kind: 'non_session', asOfDate: '2027-11-25', reason: 'holiday' })
  })

  it('rejects a weekend', () => {
    expect(getXnysSession('2026-10-24')).toEqual({ kind: 'non_session', asOfDate: '2026-10-24', reason: 'weekend' })
  })

  it('fails closed after the explicit coverage range', () => {
    expect(getXnysSession('2028-01-03')).toEqual({ kind: 'non_session', asOfDate: '2028-01-03', reason: 'outside_coverage' })
  })

  it('permits a quote capture after close and rejects it once the next session opens', () => {
    expect(getCurrentQuoteCaptureSession(new Date('2026-10-26T21:00:00.000Z'))).toMatchObject({ kind: 'session', asOfDate: '2026-10-26' })
    expect(getCurrentQuoteCaptureSession(new Date('2026-10-27T14:00:00.000Z'))).toEqual({ kind: 'non_session', asOfDate: '2026-10-26', reason: 'outside_coverage' })
  })
})
