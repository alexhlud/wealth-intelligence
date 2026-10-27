import { describe, expect, it } from 'vitest'
import { formatQuantity, formatUsd, marketValue, percentageOf, sumDecimals } from './prices'

describe('fixed-price calculations', () => {
  it('multiplies fractional values without a floating-point conversion', () => {
    expect(marketValue('20.5', '500.00')).toBe('10250')
  })

  it('sums decimal values exactly before formatting', () => {
    expect(formatUsd(sumDecimals(['0.10', '0.20', '10250']))).toBe('$10,250.30')
  })

  it('preserves integer-only totals for one or several selected holdings', () => {
    expect(sumDecimals(['10250'])).toBe('10250')
    expect(formatUsd(sumDecimals(['10250', '10250']))).toBe('$20,500.00')
  })

  it('calculates allocations without floating-point arithmetic', () => {
    expect(percentageOf('25', '100')).toBe('25.00%')
    expect(percentageOf('1', '3')).toBe('33.33%')
    expect(percentageOf('0.522969775254', '1')).toBe('52.30%')
    expect(percentageOf('1', '0')).toBeNull()
  })

  it('trims only non-significant quantity zeroes for display', () => {
    expect(formatQuantity('16.000000000000')).toBe('16')
    expect(formatQuantity('20.500000000000')).toBe('20.5')
  })
})
