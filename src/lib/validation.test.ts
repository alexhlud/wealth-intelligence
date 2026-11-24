import { describe, expect, it } from 'vitest'
import { accountInputSchema, accountResponseSchema, invitationPasswordInputSchema, liabilityInputSchema, manualAssetInputSchema, openPositionResponseSchema, parsePositionResponse, passwordResetInputSchema, positionInputSchema, positionIntentSchema, signInInputSchema, validationErrorMessage } from './validation'
import { liabilityResponseSchema, manualAssetResponseSchema } from './validation'

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
    // positions.quantity is numeric(28,12), so 13 places exceeds its scale.
    { quantity: '20.1234567890123', average_cost: 400 },
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

describe('Phase 3b-2 mutation validation', () => {
  it('requires a known-shaped, UTC position intent without coercing decimals', () => {
    expect(positionIntentSchema.safeParse({ accountId: '11111111-1111-4111-8111-111111111111', symbol: ' qqq ', securityName: ' Invesco QQQ ', assetType: 'etf', quantity: '20.5', averageCost: '400', occurredAt: '2026-09-02T12:00:00.000Z', notes: '' }).data).toMatchObject({ symbol: 'QQQ', notes: null, quantity: '20.5' })
    expect(positionIntentSchema.safeParse({ accountId: 'not-a-uuid', symbol: 'QQQ', securityName: 'QQQ', assetType: 'etf', quantity: '1.123456789', averageCost: '-1', occurredAt: 'not-a-date', notes: '' }).success).toBe(false)
  })

  it('accepts Phase 2a asset and liability categories and rejects malformed values', () => {
    const common = { accountId: null, name: 'Home', value: '0', includeInNetWorth: true, notes: null, asOf: '2026-09-02T12:00:00.000Z' }
    expect(manualAssetInputSchema.safeParse({ ...common, category: 'real_estate' }).success).toBe(true)
    expect(liabilityInputSchema.safeParse({ ...common, category: 'mortgage' }).success).toBe(true)
    expect(manualAssetInputSchema.safeParse({ ...common, category: 'crypto', value: '0.000000001' }).success).toBe(false)
  })
})

describe('MFA-3 Auth validation', () => {
  it('validates a password recovery email without requiring a password', () => {
    expect(passwordResetInputSchema.safeParse({ email: ' user@example.com ' }).data).toEqual({ email: 'user@example.com' })
    expect(passwordResetInputSchema.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })

  it('uses the same accurate 8-to-128-character password rule for sign-in and password updates', () => {
    expect(signInInputSchema.safeParse({ email: 'user@example.com', password: 'timmy123' }).success).toBe(true)
    expect(invitationPasswordInputSchema.safeParse({ password: 'timmy123' }).success).toBe(true)

    const tooShort = invitationPasswordInputSchema.safeParse({ password: 'timmy12' })
    expect(tooShort.success).toBe(false)
    if (!tooShort.success) expect(validationErrorMessage('invitationPassword', tooShort.error)).toBe('Use at least 8 characters.')

    const tooLong = signInInputSchema.safeParse({ email: 'user@example.com', password: 'a'.repeat(129) })
    expect(tooLong.success).toBe(false)
    if (!tooLong.success) expect(validationErrorMessage('signIn', tooLong.error)).toBe('Use 128 characters or fewer.')
  })
})

describe('Trust batch A read checks', () => {
  const ids = {
    id: '33333333-3333-4333-8333-333333333333',
    accountId: '11111111-1111-4111-8111-111111111111',
    portfolioId: '22222222-2222-4222-8222-222222222222',
  }

  function openPosition(quantity: unknown, averageCost: unknown) {
    return {
      id: ids.id,
      account_id: ids.accountId,
      symbol: 'QQQ',
      security_name: 'Invesco QQQ',
      asset_type: 'etf',
      status: 'open',
      quantity,
      average_cost: averageCost,
    }
  }

  function item(extra: Record<string, unknown>) {
    return {
      id: ids.id,
      portfolio_id: ids.portfolioId,
      account_id: null,
      name: 'Item',
      currency_code: 'USD',
      include_in_net_worth: true,
      notes: null,
      ...extra,
    }
  }

  it('loads a zero cost basis as text or as a PostgREST number', () => {
    const rows = openPositionResponseSchema.parse([
      openPosition('1', '0'),
      openPosition(1, 0),
      openPosition('1', '0.00000000'),
    ])
    expect(rows.map((row) => row.average_cost)).toEqual(['0', '0', '0.00000000'])
  })

  it('loads a zero asset value and a zero liability balance', () => {
    const asOf = '2026-11-20T12:00:00.000Z'
    const asset = manualAssetResponseSchema.parse([
      item({ category: 'cash', current_value: 0, value_as_of: asOf }),
    ])
    const liability = liabilityResponseSchema.parse([
      item({ category: 'mortgage', outstanding_balance: '0', balance_as_of: asOf }),
    ])
    expect(asset[0]?.current_value).toBe('0')
    expect(liability[0]?.outstanding_balance).toBe('0')
  })

  it('keeps open position quantity strictly positive', () => {
    expect(() => openPositionResponseSchema.parse([openPosition(0, 1)])).toThrow()
    expect(() => openPositionResponseSchema.parse([openPosition('0', '1')])).toThrow()
    expect(() => openPositionResponseSchema.parse([openPosition('0.000000000000', '1')])).toThrow()
  })

  it('rejects negative values in every read column', () => {
    expect(() => openPositionResponseSchema.parse([openPosition('-1', '1')])).toThrow()
    expect(() => openPositionResponseSchema.parse([openPosition('1', -1)])).toThrow()
    expect(() => manualAssetResponseSchema.parse([
      item({ category: 'cash', current_value: '-1', value_as_of: '2026-11-20T12:00:00.000Z' }),
    ])).toThrow()
  })

  it('reads quantity at its numeric(28,12) scale exactly', () => {
    const fromText = openPositionResponseSchema.parse([openPosition('0.000000123456', '1')])
    const fromNumber = openPositionResponseSchema.parse([openPosition(0.000000123456, '1')])
    expect(fromText[0]?.quantity).toBe('0.000000123456')
    expect(fromNumber[0]?.quantity).toBe('0.000000123456')
    expect(parsePositionResponse([
      { id: ids.id, symbol: 'QQQ', quantity: 5e-7, average_cost: 1 },
    ])[0]?.quantity).toBe('0.0000005')
  })

  it('rejects more decimal places than each column stores', () => {
    expect(() => openPositionResponseSchema.parse([openPosition('0.0000000000001', '1')])).toThrow()
    expect(() => openPositionResponseSchema.parse([openPosition('1', '0.000000001')])).toThrow()
    expect(() => openPositionResponseSchema.parse([openPosition('1', 1e-9)])).toThrow()
  })

  it('rejects exponent text, which Postgres numeric text never emits', () => {
    expect(() => openPositionResponseSchema.parse([openPosition('5e-7', '1')])).toThrow()
  })
})
