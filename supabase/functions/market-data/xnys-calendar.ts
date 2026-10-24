/**
 * XNYS core-session calendar, reviewed 2026-10-24.
 *
 * Source: NYSE Group, “2026, 2027 and 2028 Holiday and Early Closings
 * Calendar”, https://ir.theice.com/press/news-details/2025/
 * NYSE-Group-Announces-2026-2027-and-2028-Holiday-and-Early-Closings-Calendar/
 *
 * Annual maintenance: before 2027-12-31, review NYSE's next annual calendar,
 * append its full holidays/early closes, update COVERAGE_END, and rerun this
 * module's tests. Do not extend this table by rule or assumption.
 */

export const XNYS_CALENDAR_COVERAGE_END = '2027-12-31'

const FULL_HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])

const EARLY_CLOSES = new Set([
  '2026-11-27', '2026-12-24',
  '2027-07-02', '2027-11-26', '2027-12-23',
])

export type XnysSession = {
  kind: 'session'
  asOfDate: string
  marketCloseAt: string
  closeTimeEt: '13:00' | '16:00'
}

export type XnysNonSession = {
  kind: 'non_session'
  asOfDate: string
  reason: 'weekend' | 'holiday' | 'outside_coverage'
}

export type XnysSessionResult = XnysSession | XnysNonSession

function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`))
}

function nyOffsetMilliseconds(date: string) {
  const noonUtc = new Date(`${date}T12:00:00.000Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(noonUtc)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')) - noonUtc.getTime()
}

function closeAt(date: string, closeHour: 13 | 16) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!, closeHour) - nyOffsetMilliseconds(date)).toISOString()
}

function openAt(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!, 9, 30) - nyOffsetMilliseconds(date)).toISOString()
}

/** Resolves only the reviewed coverage; future dates deliberately fail closed. */
export function getXnysSession(date: string): XnysSessionResult {
  if (!validDate(date) || date > XNYS_CALENDAR_COVERAGE_END) return { kind: 'non_session', asOfDate: date, reason: 'outside_coverage' }
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  if (weekday === 0 || weekday === 6) return { kind: 'non_session', asOfDate: date, reason: 'weekend' }
  if (FULL_HOLIDAYS.has(date)) return { kind: 'non_session', asOfDate: date, reason: 'holiday' }
  const closeTimeEt = EARLY_CLOSES.has(date) ? '13:00' : '16:00'
  return { kind: 'session', asOfDate: date, closeTimeEt, marketCloseAt: closeAt(date, closeTimeEt === '13:00' ? 13 : 16) }
}

function newYorkDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const item = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${item('year')}-${item('month')}-${item('day')}`
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/**
 * Resolves the only interval in which a fresh current quote can evidence the
 * most recently closed session: after its close and before the next opening.
 */
export function getCurrentQuoteCaptureSession(now = new Date()): XnysSessionResult {
  const today = newYorkDate(now)
  let candidateDate = today
  let session = getXnysSession(candidateDate)
  if (session.kind === 'session' && now.getTime() < Date.parse(session.marketCloseAt)) {
    candidateDate = addDays(candidateDate, -1)
    session = getXnysSession(candidateDate)
  }
  while (session.kind === 'non_session') {
    candidateDate = addDays(candidateDate, -1)
    session = getXnysSession(candidateDate)
  }
  let nextDate = addDays(session.asOfDate, 1)
  let next = getXnysSession(nextDate)
  while (next.kind === 'non_session') {
    if (next.reason === 'outside_coverage') return { kind: 'non_session', asOfDate: session.asOfDate, reason: 'outside_coverage' }
    nextDate = addDays(nextDate, 1)
    next = getXnysSession(nextDate)
  }
  if (now.getTime() >= Date.parse(openAt(next.asOfDate))) {
    return { kind: 'non_session', asOfDate: session.asOfDate, reason: 'outside_coverage' }
  }
  return session
}
