import { describe, expect, it } from 'vitest'
import { accountInputSchema, accountResponseSchema, openPositionResponseSchema, parsePositionResponse, positionInputSchema, validationErrorMessage } from './validation'

describe('positionInputSchema', () => {
  it('normalizes a valid fractional-share position without coercing money', () => {
    expect(positionInputSchema.parse({ symbol: ' qqq ', quantity: '20.5', averageCost: '400.125' })).toEqual({
      symbol: 'QQQ', quantity: '20.5', averageCost: '400.125',
    })
  })

  it.each([
    { symbol: 'QQQ', quantity: '0', averageCost: '400' },
    { symbol: 'QQQ', quantity: '-1', averageCost: '400' },
    { symbol: 'QQQ', quantity: 'Infinity', averageCost: '400' },
    { symbol: 'QQQ', quantity: '1', averageCost: '0' },
    { symbol: '<script>', quantity: '1', averageCost: '1' },
  ])('rejects invalid input %#', (input: { symbol: string; quantity: string; averageCost: string }) => {
    expect(positionInputSchema.safeParse(input).success).toBe(false)
  })

  it('normalizes numeric PostgREST decimals into canonical decimal strings', () => {
    expect(parsePositionResponse([
      { id: '11111111-1111-4111-8111-111111111111', symbol: 'QQQ', quantity: 20.5, average_cost: 400 },
    ])).toEqual([
      { id: '11111111-1111-4111-8111-111111111111', symbol: 'QQQ', quantity: '20.5', average_cost: '400' },
    ])
  })

  it.each([
    { quantity: 0, average_cost: 400 },
    { quantity: Number.POSITIVE_INFINITY, average_cost: 400 },
    { quantity: Number.MAX_SAFE_INTEGER + 1, average_cost: 400 },
    { quantity: '20.123456789', average_cost: 400 },
  ])('rejects malformed PostgREST numeric values %#', ({ quantity, average_cost }) => {
    expect(() => parsePositionResponse([
      { id: '11111111-1111-4111-8111-111111111111', symbol: 'QQQ', quantity, average_cost },
    ])).toThrow()
  })
})

describe('Phase 2a read validation', () => {
  it('preserves account and position NUMERIC values as decimal strings', () => {
    expect(accountResponseSchema.parse([{ id: '11111111-1111-4111-8111-111111111111', portfolio_id: '22222222-2222-4222-8222-222222222222', name: 'Taxable', institution_name: 'Northstar', account_type: 'brokerage', include_in_net_worth: true }])[0]?.name).toBe('Taxable')
    expect(openPositionResponseSchema.parse([{ id: '33333333-3333-4333-8333-333333333333', account_id: '11111111-1111-4111-8111-111111111111', symbol: 'QQQ', security_name: 'Invesco QQQ', asset_type: 'etf', status: 'open', quantity: 20.5, average_cost: 400 }])[0]?.quantity).toBe('20.5')
  })

  it('validates account form details before a write', () => {
    expect(accountInputSchema.safeParse({ name: ' Taxable ', institutionName: '', accountType: 'brokerage', includeInNetWorth: true }).data).toEqual({ name: 'Taxable', institutionName: null, accountType: 'brokerage', includeInNetWorth: true })
    expect(accountInputSchema.safeParse({ name: ' Taxable ', institutionName: null, accountType: 'brokerage', includeInNetWorth: true }).data).toEqual({ name: 'Taxable', institutionName: null, accountType: 'brokerage', includeInNetWorth: true })
    expect(accountInputSchema.safeParse({ name: '', institutionName: '', accountType: 'not-a-type', includeInNetWorth: true }).success).toBe(false)
  })

  it('maps account validation errors to authored copy', () => {
    const result = accountInputSchema.safeParse({ name: 'Taxable', institutionName: 42, accountType: 'brokerage', includeInNetWorth: true })
    expect(result.success).toBe(false)
    if (!result.success) expect(validationErrorMessage('account', result.error)).toBe('Enter an institution of 120 characters or fewer.')
  })
})
