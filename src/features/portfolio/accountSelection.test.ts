import { describe, expect, it } from 'vitest'
import { reconcileAccountSelection } from './accountSelection'

describe('Holdings account selection', () => {
  it('defaults to every account and removes stale saved IDs from another portfolio', () => {
    expect([...reconcileAccountSelection(null, ['account-a', 'account-b'])]).toEqual(['account-a', 'account-b'])
    expect([...reconcileAccountSelection(['old-account'], ['account-a', 'account-b'])]).toEqual([])
  })

  it('preserves a valid subset so the table can show only that account’s positions', () => {
    expect([...reconcileAccountSelection(['account-b', 'old-account'], ['account-a', 'account-b'])]).toEqual(['account-b'])
  })
})
