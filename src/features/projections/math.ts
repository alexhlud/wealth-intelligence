export type ProjectionAssumptions = { investmentRate: string; assetRate: string; inflationRate: string; years: number }
export type ProjectionBaseline = { investments: string; assets: string; liabilities: string; yearMonth: string }
export type ProjectionPoint = { month: number; yearMonth: string; investments: string; assets: string; liabilities: string; nominal: string; real: string }

const scale = 12
const factor = 10n ** BigInt(scale)

function parse(value: string) { const negative = value.startsWith('-'); const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.'); const integer = BigInt(`${whole}${fraction.padEnd(scale, '0').slice(0, scale)}`); return negative ? -integer : integer }
function render(value: bigint) { const negative = value < 0n; const digits = (negative ? -value : value).toString().padStart(scale + 1, '0'); const whole = digits.slice(0, -scale); const fraction = digits.slice(-scale).replace(/0+$/, ''); return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}` }
function multiply(left: bigint, right: bigint) { const product = left * right; return product >= 0n ? (product + factor / 2n) / factor : (product - factor / 2n) / factor }
function addMonths(yearMonth: string, months: number) { const [year, month] = yearMonth.split('-').map(Number); const value = year * 12 + month - 1 + months; return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}` }

/** The sole floating-point use converts an uncertain annual assumption to a monthly rate. All money compounding uses fixed decimal integers afterwards. */
export function monthlyRate(annualPercent: string) {
  const value = Number(annualPercent)
  if (!Number.isFinite(value) || value < -100) throw new Error('Invalid annual rate')
  return render(parse((Math.pow(1 + value / 100, 1 / 12) - 1).toFixed(scale)))
}

export function project(baseline: ProjectionBaseline, assumptions: ProjectionAssumptions, contribution: string): ProjectionPoint[] {
  const investmentFactor = factor + parse(monthlyRate(assumptions.investmentRate)); const assetFactor = factor + parse(monthlyRate(assumptions.assetRate)); const inflationFactor = factor + parse(monthlyRate(assumptions.inflationRate)); const payment = parse(contribution)
  let investments = parse(baseline.investments); let assets = parse(baseline.assets); const liabilities = parse(baseline.liabilities); let deflator = factor
  const output: ProjectionPoint[] = []
  for (let month = 0; month <= assumptions.years * 12; month += 1) {
    const nominal = investments + assets - liabilities
    const real = nominal * factor / deflator
    if (month === 0 || month % 12 === 0) output.push({ month, yearMonth: addMonths(baseline.yearMonth, month), investments: render(investments), assets: render(assets), liabilities: render(liabilities), nominal: render(nominal), real: render(real) })
    if (month < assumptions.years * 12) { investments = multiply(investments, investmentFactor) + payment; assets = multiply(assets, assetFactor); deflator = multiply(deflator, inflationFactor) }
  }
  return output
}
