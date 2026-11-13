import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDateTimeLocal } from './datetimeLocal'

describe('formatDateTimeLocal', () => {
  afterEach(() => vi.useRealTimers())

  it('renders a winter instant as New York local wall-clock time', () => {
    vi.stubEnv('TZ', 'America/New_York')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T16:30:00.000Z'))

    expect(formatDateTimeLocal()).toBe('2026-01-15T11:30')
  })

  it('renders a summer instant as New York local wall-clock time', () => {
    vi.stubEnv('TZ', 'America/New_York')

    expect(formatDateTimeLocal('2026-07-15T15:30:00.000Z')).toBe('2026-07-15T11:30')
  })
})
