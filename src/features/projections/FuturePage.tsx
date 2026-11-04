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
import { formatUsd, marketValue, subtractDecimals, sumDecimals } from '@/features/portfolio/prices'
import { useQuotes } from '@/features/market-data/useQuotes'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { project, type ProjectionBaseline } from './math'
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

async function load() {
  const { data, error } = await supabase.rpc('ensure_primary_portfolio')
  if (error) throw error
  const portfolio = portfolioResponseSchema.parse([data])[0]!
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

function Chart({ paths, mode }: { paths: { name: string; points: ReturnType<typeof project> }[]; mode: 'nominal' | 'real' }) {
  const maximum = Math.max(...paths.flatMap((path) => path.points.map((point) => Number(mode === 'nominal' ? point.nominal : point.real))), 1)
  return <div className="projection-chart-wrap"><svg className="projection-chart" viewBox="0 0 800 250" role="img" aria-label={`${mode === 'nominal' ? 'Nominal' : 'Inflation-adjusted'} projected net worth comparison`}><line x1="42" x2="780" y1="210" y2="210" className="history-axis" />{paths.map((path, index) => { const d = path.points.map((point, i) => `${i ? 'L' : 'M'} ${42 + i * 738 / Math.max(1, path.points.length - 1)} ${210 - Number(mode === 'nominal' ? point.nominal : point.real) / maximum * 175}`).join(' '); return <g key={path.name}><path d={d} className={`projection-line p${index}`} /><text x="780" y={26 + index * 16}>{path.name}</text></g> })}</svg></div>
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

  if (data.isPending || (quotes.isPending && included.length)) return <LoadingState>Loading your projection baseline…</LoadingState>
  if (data.isError || quotes.isError || !d) return <ErrorState onRetry={() => { void data.refetch(); void quotes.refetch() }} />

  const bySymbol = new Map((quotes.data ?? []).map((quote) => [quote.symbol, quote]))
  const missing = included.filter((position) => !bySymbol.get(position.symbol)?.price)
  const investments = sumDecimals(included.flatMap((position) => { const price = bySymbol.get(position.symbol)?.price; return price ? [marketValue(position.quantity, price)] : [] }))
  const assets = sumDecimals(d.assets.filter((asset) => asset.include_in_net_worth && (!asset.account_id || d.accounts.find((account) => account.id === asset.account_id)?.include_in_net_worth)).map((asset) => asset.current_value))
  const liabilities = sumDecimals(d.liabilities.filter((liability) => liability.include_in_net_worth && (!liability.account_id || d.accounts.find((account) => account.id === liability.account_id)?.include_in_net_worth)).map((liability) => liability.outstanding_balance))
  const baseline: ProjectionBaseline = source === 'recorded' && d.snapshot ? { investments: d.snapshot.investment_value, assets: d.snapshot.manual_asset_value, liabilities: d.snapshot.liability_value, yearMonth: d.snapshot.as_of_date.slice(0, 7) } : { investments, assets, liabilities, yearMonth: new Date().toISOString().slice(0, 7) }
  const parsed = assumptionsSchema.safeParse({ investmentRate, inflationRate, years, custom })
  const assumptions = parsed.success ? { investmentRate, assetRate: inflationRate, inflationRate, years: parsed.data.years } : null
  const choices = presets.filter((preset) => selected.includes(preset.value ?? 'custom')).map((preset) => ({ ...preset, value: preset.value ?? custom })).filter((preset) => decimal.safeParse(preset.value).success)
  const paths = assumptions ? choices.map((choice) => ({ name: choice.name, points: project(baseline, assumptions, choice.value) })) : []
  const netWorth = subtractDecimals(sumDecimals([baseline.investments, baseline.assets]), baseline.liabilities)
  const milestones = standardMilestones.filter((target) => BigInt(target) > BigInt(netWorth.split('.')[0] ?? '0'))

  return <section className="future-page"><header className="page-header"><div><h1>Future, under stated assumptions.</h1><p>{source === 'recorded' && d.snapshot ? `Projected from recorded net worth of ${formatUsd(netWorth)} on ${d.snapshot.as_of_date}.` : `Projected from live net worth of ${formatUsd(netWorth)} as of now.`}</p></div></header>
    <section className="projection-controls"><div><h2>Baseline</h2><label><select value={source} onChange={(event) => setSource(event.target.value as 'live' | 'recorded')}><option value="live">Live current value</option><option value="recorded" disabled={!d.snapshot}>Recorded snapshot{d.snapshot ? ` · ${d.snapshot.as_of_date}` : ' unavailable'}</option></select></label><p>Investments {formatUsd(baseline.investments)} · Non-investment assets {formatUsd(baseline.assets)} · Liabilities −{formatUsd(baseline.liabilities)}</p></div><div><h2>Assumptions</h2><label>Investment return (%)<input value={investmentRate} onChange={(event) => setInvestmentRate(event.target.value)} /></label><label>Inflation (%)<input value={inflationRate} onChange={(event) => setInflationRate(event.target.value)} /></label><label>Non-investment asset growth (%)<input value={inflationRate} readOnly aria-label="Non-investment asset growth equals inflation" /></label><p>Matches inflation by default, holding real value without a directional price bet. Liabilities are held flat.</p><label>Horizon (years)<input value={years} onChange={(event) => setYears(event.target.value)} /></label></div></section>
    {missing.length ? <p className="quote-warning">Incomplete — {missing.map((position) => position.symbol).join(', ')} {missing.length === 1 ? 'is' : 'are'} excluded because no current price is available.</p> : null}
    <section className="projection-compare"><h2>Compare contribution paths</h2><div className="projection-presets">{presets.map((preset) => { const value = preset.value ?? 'custom'; const isSelected = selected.includes(value); return <div key={value} className="projection-preset"><label className="checkbox-row"><input type="checkbox" checked={isSelected} onChange={() => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />{preset.name}</label>{preset.note ? <small>{preset.note}</small> : null}{preset.value === null && isSelected ? <label className="projection-custom">Custom monthly contribution<input value={custom} onChange={(event) => setCustom(event.target.value)} aria-label="Custom monthly contribution" /></label> : null}</div> })}</div><p>Each path is an alternative monthly-contribution assumption; paths are not added together.</p><div className="history-periods"><button className={mode === 'nominal' ? 'active' : ''} onClick={() => setMode('nominal')}>Nominal</button><button className={mode === 'real' ? 'active' : ''} onClick={() => setMode('real')}>Inflation-adjusted</button></div>{paths.length >= 2 ? <Chart paths={paths} mode={mode} /> : <p className="form-error">Select at least two valid contribution paths.</p>}</section>
    {milestones.length && paths.length ? <section className="projection-table"><h2>Next milestones</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Milestone</th>{paths.map((path) => <th key={path.name}>{path.name}</th>)}</tr></thead><tbody>{milestones.map((target) => <tr key={target}><td>{formatUsd(target)}</td>{paths.map((path) => { const point = path.points.find((item) => BigInt(item.nominal.split('.')[0] ?? '0') >= BigInt(target)); return <td key={path.name}>{point ? point.yearMonth : `Not reached within ${assumptions?.years ?? years} years`}</td> })}</tr>)}</tbody></table></div></section> : null}
    {paths.length ? <section className="projection-table"><h2>Annual projection</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Point</th>{paths.map((path) => <th key={path.name}>{path.name}</th>)}</tr></thead><tbody>{paths[0]!.points.map((point, index) => <tr key={point.month}><td>Year {point.month / 12} · {point.yearMonth}</td>{paths.map((path) => <td key={path.name}>{formatUsd(mode === 'nominal' ? path.points[index]!.nominal : path.points[index]!.real)}</td>)}</tr>)}</tbody></table></div></section> : null}</section>
}
