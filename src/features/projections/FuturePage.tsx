import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import {
  accountResponseSchema,
  liabilityResponseSchema,
  manualAssetResponseSchema,
  openPositionResponseSchema,
  portfolioResponseSchema,
} from '@/lib/validation'
import {
  formatUsd,
  marketValue,
  subtractDecimals,
  sumDecimals,
} from '@/features/portfolio/prices'
import { useQuotes } from '@/features/market-data/useQuotes'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { project, type ProjectionBaseline, type ProjectionPoint } from './math'
import { standardMilestones } from '@/features/dashboard/milestones'
import { parseProjectionBaselineResponse } from './data'

const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/)

const assumptionsSchema = z.object({
  investmentRate: z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/),
  inflationRate: z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/),
  years: z.coerce.number().int().min(1).max(60),
  custom: decimal,
})

const presets = [
  { name: 'No new contributions', value: '0', note: 'The Coast FIRE case.' },
  { name: '$500 / mo', value: '500' },
  { name: '$1,000 / mo', value: '1000' },
  { name: '$2,000 / mo', value: '2000' },
  { name: 'Custom', value: null },
]

const chartStyles = [
  { className: 'p0', description: 'solid line' },
  { className: 'p1', description: 'long-dashed line' },
  { className: 'p2', description: 'short-dashed line' },
  { className: 'p3', description: 'dot-dashed line' },
]

type Path = { name: string; points: ProjectionPoint[] }

function formatYearMonth(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}-01T00:00:00.000Z`))
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function displayValue(point: ProjectionPoint, mode: 'nominal' | 'real') {
  return mode === 'nominal' ? point.nominal : point.real
}

function moneyAxis(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return formatUsd(String(Math.round(value)))
}

async function load() {
  const ensured = await supabase.rpc('ensure_primary_portfolio')
  if (ensured.error) throw ensured.error
  const portfolio = portfolioResponseSchema.parse([ensured.data])[0]!
  const [accounts, positions, assets, liabilities, snapshot] = await Promise.all([
    supabase.from('accounts').select('id, portfolio_id, name, institution_name, account_type, include_in_net_worth, currency_code').eq('portfolio_id', portfolio.id),
    supabase.from('positions').select('id, account_id, symbol, security_name, asset_type, status, quantity, average_cost').eq('portfolio_id', portfolio.id).eq('status', 'open'),
    supabase.from('manual_assets').select('*').eq('portfolio_id', portfolio.id),
    supabase.from('liabilities').select('*').eq('portfolio_id', portfolio.id),
    supabase.rpc('get_newest_projection_snapshot_baseline', { p_portfolio_id: portfolio.id }),
  ])
  if (accounts.error || positions.error || assets.error || liabilities.error || snapshot.error) {
    throw new Error('Future projection unavailable')
  }
  return {
    portfolio,
    accounts: accountResponseSchema.parse(accounts.data),
    positions: openPositionResponseSchema.parse(positions.data),
    assets: manualAssetResponseSchema.parse(assets.data),
    liabilities: liabilityResponseSchema.parse(liabilities.data),
    snapshot: parseProjectionBaselineResponse(snapshot.data),
  }
}

function Chart({ paths, mode, selectedIndex, onSelect }: {
  paths: Path[]
  mode: 'nominal' | 'real'
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  const values = paths.flatMap((path) => path.points.map((point) => Number(displayValue(point, mode))))
  const maximum = Math.max(...values, 1)
  const minimum = Math.min(...values, 0)
  const range = maximum - minimum || 1
  const chart = { left: 76, right: 772, top: 24, bottom: 218 }
  const width = chart.right - chart.left
  const height = chart.bottom - chart.top
  const yFor = (value: number) => chart.bottom - (value - minimum) / range * height
  const xFor = (index: number) => chart.left + index * width / Math.max(1, paths[0]!.points.length - 1)
  const ticks = [minimum, minimum + range / 2, maximum]
  const yearIndexes = paths[0]!.points.reduce<number[]>((result, point, index) => {
    const isFinal = index === paths[0]!.points.length - 1
    if (index === 0 || isFinal || Number(point.yearMonth.slice(0, 4)) % 5 === 0) result.push(index)
    return result
  }, [])

  return <div className="projection-chart-region">
    <div className="projection-legend" aria-label="Contribution path legend">
      {paths.map((path, index) => <span key={path.name} className="projection-legend-item">
        <i className={`projection-legend-line ${chartStyles[index % chartStyles.length]!.className}`} />
        {path.name}
      </span>)}
    </div>
    <div className="projection-chart-wrap">
      <svg className="projection-chart" viewBox="0 0 800 270" role="img" aria-label={`${mode === 'nominal' ? 'Future dollars' : "Today's dollars"} projected net worth by calendar year`}>
        <text className="projection-axis-title" x="18" y="121" transform="rotate(-90 18 121)">Net worth (dollars)</text>
        {ticks.map((value) => <g key={value}>
          <line x1={chart.left} x2={chart.right} y1={yFor(value)} y2={yFor(value)} className="projection-grid" />
          <text x={chart.left - 10} y={yFor(value) + 4} textAnchor="end">{moneyAxis(value)}</text>
        </g>)}
        <line x1={chart.left} x2={chart.right} y1={chart.bottom} y2={chart.bottom} className="projection-axis" />
        {yearIndexes.map((index) => <g key={paths[0]!.points[index]!.yearMonth}>
          <line x1={xFor(index)} x2={xFor(index)} y1={chart.bottom} y2={chart.bottom + 5} className="projection-axis" />
          <text x={xFor(index)} y={chart.bottom + 20} textAnchor="middle">{paths[0]!.points[index]!.yearMonth.slice(0, 4)}</text>
        </g>)}
        <text className="projection-axis-title" x={(chart.left + chart.right) / 2} y="262" textAnchor="middle">Calendar year</text>
        {paths.map((path, index) => <path key={path.name} className={`projection-line ${chartStyles[index % chartStyles.length]!.className}`} d={path.points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${xFor(pointIndex)} ${yFor(Number(displayValue(point, mode)))}`).join(' ')} />)}
        <line x1={xFor(selectedIndex)} x2={xFor(selectedIndex)} y1={chart.top} y2={chart.bottom} className="projection-crosshair" />
        {paths.map((path, index) => <circle key={path.name} cx={xFor(selectedIndex)} cy={yFor(Number(displayValue(path.points[selectedIndex]!, mode)))} r="5" className={`projection-point ${chartStyles[index % chartStyles.length]!.className}`} />)}
        {paths[0]!.points.map((point, index) => <foreignObject key={point.month} x={xFor(index) - 14} y={chart.top} width="28" height={height}>
          <button type="button" className="projection-point-button" onClick={() => onSelect(index)} aria-label={`Select ${formatYearMonth(point.yearMonth)}`} />
        </foreignObject>)}
      </svg>
    </div>
  </div>
}

function Composition({ paths, index, title }: {
  paths: Path[]
  index: number
  title: string
}) {
  const date = paths[0]?.points[index]?.yearMonth
  if (!date) return null

  return <section className="projection-composition" aria-labelledby={`${title}-title`}>
    <div>
      <h2 id={`${title}-title`}>{title}</h2>
      <p>{formatYearMonth(date)} · future dollars</p>
    </div>
    <div className="table-wrap">
      <table className="data-table projection-composition-table">
        <thead>
          <tr>
            <th>Path</th>
            <th>Investments</th>
            <th>Non-investment assets</th>
            <th>Liabilities</th>
          </tr>
        </thead>
        <tbody>
          {paths.map((path) => {
            const point = path.points[index]!
            return <tr key={path.name}>
              <td>{path.name}</td>
              <td>{formatUsd(point.investments)}</td>
              <td>{formatUsd(point.assets)}</td>
              <td>−{formatUsd(point.liabilities)}</td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </section>
}

export function FuturePage() {
  const data = useQuery({ queryKey: ['projection-baseline'], queryFn: load })
  const d = data.data
  const included = d?.positions.filter((position) => d.accounts.find((account) => account.id === position.account_id)?.include_in_net_worth) ?? []
  const quotes = useQuotes(d?.portfolio.id, included.map((position) => position.symbol))
  const [source, setSource] = useState<'live' | 'recorded'>('live')
  const [selected, setSelected] = useState<string[]>(['0', '500', '1000'])
  const [custom, setCustom] = useState('1500')
  const [mode, setMode] = useState<'nominal' | 'real'>('nominal')
  const [investmentRate, setInvestmentRate] = useState('7')
  const [inflationRate, setInflationRate] = useState('2.5')
  const [years, setYears] = useState('30')
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)
  const [showEveryYear, setShowEveryYear] = useState(false)

  if (data.isPending || quotes.isPending && included.length) return <LoadingState>Loading your projection baseline…</LoadingState>
  if (data.isError || quotes.isError || !d) return <ErrorState onRetry={() => { void data.refetch(); void quotes.refetch() }} />

  const bySymbol = new Map((quotes.data ?? []).map((quote) => [quote.symbol, quote]))
  const missing = included.filter((position) => !bySymbol.get(position.symbol)?.price)
  const investments = sumDecimals(included.flatMap((position) => {
    const price = bySymbol.get(position.symbol)?.price
    return price ? [marketValue(position.quantity, price)] : []
  }))
  const assets = sumDecimals(d.assets.filter((asset) => asset.include_in_net_worth && (!asset.account_id || d.accounts.find((account) => account.id === asset.account_id)?.include_in_net_worth)).map((asset) => asset.current_value))
  const liabilities = sumDecimals(d.liabilities.filter((liability) => liability.include_in_net_worth && (!liability.account_id || d.accounts.find((account) => account.id === liability.account_id)?.include_in_net_worth)).map((liability) => liability.outstanding_balance))
  const latestQuoteTimestamp = (quotes.data ?? []).map((quote) => quote.fetchedAt).sort().at(-1) ?? new Date().toISOString()
  const baseline: ProjectionBaseline = source === 'recorded' && d.snapshot ? { investments: d.snapshot.investment_value, assets: d.snapshot.manual_asset_value, liabilities: d.snapshot.liability_value, yearMonth: d.snapshot.as_of_date.slice(0, 7) } : { investments, assets, liabilities, yearMonth: new Date().toISOString().slice(0, 7) }
  const parsed = assumptionsSchema.safeParse({ investmentRate, inflationRate, years, custom })
  const assumptions = parsed.success ? { investmentRate, assetRate: inflationRate, inflationRate, years: parsed.data.years } : null
  const choices = presets.filter((preset) => selected.includes(preset.value ?? 'custom')).map((preset) => ({ ...preset, value: preset.value ?? custom })).filter((preset) => decimal.safeParse(preset.value).success)
  const paths = assumptions
    ? choices.map((choice) => ({
      name: choice.name,
      points: project(baseline, assumptions, choice.value),
    }))
    : []
  const netWorth = subtractDecimals(sumDecimals([baseline.investments, baseline.assets]), baseline.liabilities)
  const milestones = standardMilestones.filter((target) => BigInt(target) > BigInt(netWorth.split('.')[0] ?? '0'))
  const pinnedIndex = Math.min(selectedPointIndex ?? Math.max(0, (paths[0]?.points.length ?? 1) - 1), Math.max(0, (paths[0]?.points.length ?? 1) - 1))
  const annualRows = paths[0]?.points.filter((_, index, points) => showEveryYear || index % 5 === 0 || index === points.length - 1) ?? []

  return <section className="future-page"><header className="page-header"><div><h1>Future, under stated assumptions.</h1><p>{source === 'recorded' && d.snapshot ? `Projected from recorded net worth of ${formatUsd(netWorth)} on ${formatYearMonth(d.snapshot.as_of_date.slice(0, 7))}.` : `Projected from live net worth of ${formatUsd(netWorth)} as of ${formatTimestamp(latestQuoteTimestamp)}.`}</p></div></header>
    {missing.length ? <p className="quote-warning">Incomplete — {missing.map((position) => position.symbol).join(', ')} {missing.length === 1 ? 'is' : 'are'} excluded because no current price is available.</p> : null}
    <section className="projection-controls"><div><h2>Baseline</h2><label>Source<select value={source} onChange={(event) => setSource(event.target.value as 'live' | 'recorded')}><option value="live">Live current value</option><option value="recorded" disabled={!d.snapshot}>Recorded snapshot{d.snapshot ? ` · ${formatYearMonth(d.snapshot.as_of_date.slice(0, 7))}` : ' unavailable'}</option></select></label><p>Investments {formatUsd(baseline.investments)} · Non-investment assets {formatUsd(baseline.assets)} · Liabilities −{formatUsd(baseline.liabilities)}</p></div><div><h2>Assumptions</h2><label>Investment return before inflation (%)<input value={investmentRate} onChange={(event) => setInvestmentRate(event.target.value)} inputMode="decimal" /></label><label>Inflation (%)<input value={inflationRate} onChange={(event) => setInflationRate(event.target.value)} inputMode="decimal" /></label><label>Non-investment asset growth (%)<input value={inflationRate} readOnly aria-label="Non-investment asset growth equals inflation" /></label><p>Matches inflation by default, holding real value without a directional price bet. Liabilities are held flat.</p><label>Horizon (years)<input value={years} onChange={(event) => setYears(event.target.value)} inputMode="numeric" /></label></div></section>
    <section className="projection-compare" aria-labelledby="projection-compare-title"><h2 id="projection-compare-title">Compare contribution paths</h2><div className="projection-presets">{presets.map((preset) => { const value = preset.value ?? 'custom'; const isSelected = selected.includes(value); return <div key={value} className="projection-preset"><label className="checkbox-row"><input type="checkbox" checked={isSelected} onChange={() => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />{preset.name}</label>{preset.note ? <small>{preset.note}</small> : null}{preset.value === null && isSelected ? <label className="projection-custom">Custom monthly contribution<input value={custom} onChange={(event) => setCustom(event.target.value)} inputMode="decimal" /></label> : null}</div> })}</div><p>Each path is an alternative monthly-contribution assumption; paths are not added together.</p><div className="history-periods" role="group" aria-label="Value display"><button type="button" className={mode === 'nominal' ? 'active' : ''} onClick={() => setMode('nominal')} aria-pressed={mode === 'nominal'}>Future dollars</button><button type="button" className={mode === 'real' ? 'active' : ''} onClick={() => setMode('real')} aria-pressed={mode === 'real'}>Today’s dollars</button></div>{paths.length >= 2 ? <><Chart paths={paths} mode={mode} selectedIndex={pinnedIndex} onSelect={setSelectedPointIndex} /><div className="projection-reading" aria-live="polite"><span>Pinned reading · {formatYearMonth(paths[0]!.points[pinnedIndex]!.yearMonth)}</span><div>{paths.map((path) => <p key={path.name}><strong>{path.name}</strong><b>{formatUsd(displayValue(path.points[pinnedIndex]!, mode))}</b></p>)}</div></div><Composition paths={paths} index={pinnedIndex} title="Pinned value composition" /></> : <p className="form-error">Select at least two valid contribution paths.</p>}</section>
    {paths.length ? <Composition paths={paths} index={paths[0]!.points.length - 1} title="Horizon value composition" /> : null}
    {milestones.length && paths.length ? <section className="projection-table"><h2>Next milestones</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Milestone</th>{paths.map((path) => <th key={path.name}>{path.name}</th>)}</tr></thead><tbody>{milestones.map((target) => <tr key={target}><td>{formatUsd(target)}</td>{paths.map((path) => { const point = path.points.find((item) => BigInt(item.nominal.split('.')[0] ?? '0') >= BigInt(target)); return <td key={path.name}>{point ? formatYearMonth(point.yearMonth) : `Not reached within ${assumptions?.years ?? years} years`}</td> })}</tr>)}</tbody></table></div></section> : null}
    {paths.length ? <section className="projection-table"><div className="projection-table-heading"><div><h2>Annual projection</h2><p>Accessible text equivalent of the chart.</p></div><button type="button" className="button button-secondary" onClick={() => setShowEveryYear((current) => !current)}>{showEveryYear ? 'Show every five years' : 'Show every year'}</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Point</th>{paths.map((path) => <th key={path.name}>{path.name}</th>)}</tr></thead><tbody>{annualRows.map((point) => { const index = paths[0]!.points.findIndex((candidate) => candidate.month === point.month); return <tr key={point.month}><td>Year {point.month / 12} · {formatYearMonth(point.yearMonth)}</td>{paths.map((path) => <td key={path.name}>{formatUsd(displayValue(path.points[index]!, mode))}</td>)}</tr> })}</tbody></table></div></section> : null}
  </section>
}
