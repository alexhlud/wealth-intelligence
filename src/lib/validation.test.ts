import { describe, expect, it } from 'vitest'
import { positionInputSchema } from './validation'

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
})
