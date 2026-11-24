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

describe('USD display rounding', () => {
  it('rounds half away from zero to cents, as Postgres round() does', () => {
    expect(formatUsd('0.005')).toBe('$0.01')
    expect(formatUsd('1.994')).toBe('$1.99')
    expect(formatUsd('2.995')).toBe('$3.00')
    expect(formatUsd('999.995')).toBe('$1,000.00')
    expect(formatUsd('-0.005')).toBe('−$0.01')
    expect(formatUsd('-2.995')).toBe('−$3.00')
  })

  it('places a U+2212 minus sign before the dollar sign', () => {
    expect(formatUsd('-1234.5')).toBe('−$1,234.50')
    expect(formatUsd('-1234567')).toBe('−$1,234,567.00')
  })

  it('never shows a negative zero', () => {
    expect(formatUsd('-0.004')).toBe('$0.00')
    expect(formatUsd('-0')).toBe('$0.00')
  })

  it('keeps exact values and integer values unchanged', () => {
    expect(formatUsd('0')).toBe('$0.00')
    expect(formatUsd('10250.3')).toBe('$10,250.30')
    expect(formatUsd('12345678901234.12345678')).toBe('$12,345,678,901,234.12')
  })
})

describe('sumDecimals with negative values', () => {
  it('adds negative and positive values exactly', () => {
    expect(sumDecimals(['-1.5', '1'])).toBe('-0.5')
    expect(sumDecimals(['-0.25', '-0.75'])).toBe('-1')
    expect(sumDecimals(['100', '-0.01'])).toBe('99.99')
    expect(sumDecimals(['-5', '5'])).toBe('0')
  })

  it('returns zero for an empty list', () => {
    expect(sumDecimals([])).toBe('0')
  })
})
