/** Accepts canonical positive decimal strings; calculations never coerce to JavaScript numbers. */
export function marketValue(quantity: string, price: string): string {
  const quantityParts = quantity.split('.')
  const priceParts = price.split('.')
  const quantityScale = quantityParts[1]?.length ?? 0
  const priceScale = priceParts[1]?.length ?? 0
  const quantityInteger = BigInt(`${quantityParts[0]}${quantityParts[1] ?? ''}`)
  const priceInteger = BigInt(`${priceParts[0]}${priceParts[1] ?? ''}`)
  const product = quantityInteger * priceInteger
  const scale = quantityScale + priceScale
  const digits = product.toString().padStart(scale + 1, '0')
  const whole = scale === 0 ? digits : digits.slice(0, -scale) || '0'
  const fraction = scale === 0 ? '' : digits.slice(-scale).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

/** Decimal text as a BigInt count of 10^-scale units, keeping its sign. */
function toScaledInteger(value: string, scale: number): bigint {
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [whole, fraction = ''] = unsigned.split('.')
  const integer = BigInt(`${whole}${fraction.padEnd(scale, '0')}`)
  return negative ? -integer : integer
}

/** Inverse of toScaledInteger. Trailing fraction zeroes are dropped. */
function fromScaledInteger(value: bigint, scale: number): string {
  const negative = value < 0n
  const magnitude = negative ? -value : value
  const digits = magnitude.toString().padStart(scale + 1, '0')
  const whole = scale === 0 ? digits : digits.slice(0, -scale)
  const fraction = scale === 0 ? '' : digits.slice(-scale).replace(/0+$/, '')
  const sign = negative ? '-' : ''
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`
}

/**
 * Formats decimal text as USD for display. Rounds to cents half away from
 * zero, which matches Postgres round(numeric, 2). Negatives use U+2212.
 * See docs/ARCHITECTURE.md, "Display rounding".
 */
export function formatUsd(value: string): string {
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [whole, fraction = ''] = unsigned.split('.')
  const thousandths = BigInt(`${whole}${fraction.padEnd(3, '0').slice(0, 3)}`)
  const cents = (thousandths + 5n) / 10n
  const dollars = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const centText = (cents % 100n).toString().padStart(2, '0')
  const sign = negative && cents !== 0n ? '−' : ''
  return `${sign}$${dollars}.${centText}`
}

/** Formats a stored decimal for display without changing its significant precision. */
export function formatQuantity(value: string): string {
  const [whole, fraction = ''] = value.split('.')
  const significantFraction = fraction.replace(/0+$/, '')
  return significantFraction ? `${whole}.${significantFraction}` : whole
}

export function sumDecimals(values: readonly string[]): string {
  const scale = Math.max(0, ...values.map((value) => value.split('.')[1]?.length ?? 0))
  const total = values.reduce(
    (sum, value) => sum + toScaledInteger(value, scale),
    0n,
  )
  return fromScaledInteger(total, scale)
}

/** Returns a fixed two-place percentage using integer arithmetic only. */
export function percentageOf(value: string, total: string): string | null {
  if (total === '0') return null
  const scale = Math.max(value.split('.')[1]?.length ?? 0, total.split('.')[1]?.length ?? 0)
  const asInteger = (input: string) => {
    const [whole, fraction = ''] = input.split('.')
    return BigInt(`${whole}${fraction.padEnd(scale, '0')}`)
  }
  const denominator = asInteger(total)
  if (denominator === 0n) return null
  const numerator = asInteger(value) * 10000n
  const hundredths = numerator >= 0n
    ? (numerator + denominator / 2n) / denominator
    : (numerator - denominator / 2n) / denominator
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}%`
}

export function subtractDecimals(left: string, right: string): string {
  const scale = Math.max(left.split('.')[1]?.length ?? 0, right.split('.')[1]?.length ?? 0)
  const integer = (value: string) => { const negative = value.startsWith('-'); const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.'); const result = BigInt(`${whole}${fraction.padEnd(scale, '0')}`); return negative ? -result : result }
  const value = integer(left) - integer(right); const negative = value < 0n; const digits = (negative ? -value : value).toString().padStart(scale + 1, '0'); const whole = scale ? digits.slice(0, -scale) || '0' : digits; const fraction = scale ? digits.slice(-scale).replace(/0+$/, '') : ''
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}
