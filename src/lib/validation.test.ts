import { describe, expect, it } from 'vitest'
import { parsePositionResponse, positionInputSchema } from './validation'

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
