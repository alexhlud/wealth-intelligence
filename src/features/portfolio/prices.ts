export const HARDCODED_USD_PRICE_BY_SYMBOL: Readonly<Record<string, string>> = {
  QQQ: '500.00',
  VOO: '600.00',
}

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

export function formatUsd(value: string): string {
  const [whole, fraction = ''] = value.split('.')
  const dollars = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${dollars}.${fraction.padEnd(2, '0').slice(0, 2)}`
}

export function sumDecimals(values: readonly string[]): string {
  const scale = Math.max(0, ...values.map((value) => value.split('.')[1]?.length ?? 0))
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ''] = value.split('.')
    return sum + BigInt(`${whole}${fraction.padEnd(scale, '0')}`)
  }, 0n)
  const digits = total.toString().padStart(scale + 1, '0')
  const whole = scale === 0 ? digits : digits.slice(0, -scale) || '0'
  const fraction = scale === 0 ? '' : digits.slice(-scale).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
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
  const hundredths = (asInteger(value) * 10000n) / denominator
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}%`
}
