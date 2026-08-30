import { describe, expect, it } from 'vitest'
import { formatUsd, marketValue, sumDecimals } from './prices'

describe('fixed-price calculations', () => {
  it('multiplies fractional values without a floating-point conversion', () => {
    expect(marketValue('20.5', '500.00')).toBe('10250')
  })

  it('sums decimal values exactly before formatting', () => {
    expect(formatUsd(sumDecimals(['0.10', '0.20', '10250']))).toBe('$10,250.30')
  })
})
