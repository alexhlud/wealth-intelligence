import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { accountResponseSchema, liabilityResponseSchema, manualAssetResponseSchema, openPositionResponseSchema, portfolioResponseSchema } from '@/lib/validation'
import { formatUsd, marketValue, subtractDecimals, sumDecimals } from '@/features/portfolio/prices'
import { useQuotes } from '@/features/market-data/useQuotes'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { project, type ProjectionBaseline } from './math'
import { standardMilestones } from '@/features/dashboard/milestones'

const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/)
const assumptionsSchema = z.object({ investmentRate: z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/), inflationRate: z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/), years: z.coerce.number().int().min(1).max(60), custom: decimal })
const presets = [{ name: 'Coast FIRE', value: '0' }, { name: 'Max Roth', value: '625' }, { name: '$1,000 / mo', value: '1000' }, { name: '$2,000 / mo', value: '2000' }, { name: 'Custom', value: null }]

async function load() {
  const { data, error } = await supabase.rpc('ensure_primary_portfolio'); if (error) throw error
  const portfolio = portfolioResponseSchema.parse([data])[0]!
  const [accounts, positions, assets, liabilities, snapshot] = await Promise.all([
    supabase.from('accounts').select('id, portfolio_id, name, institution_name, account_type, include_in_net_worth, currency_code').eq('portfolio_id', portfolio.id),
    supabase.from('positions').select('id, account_id, symbol, security_name, asset_type, status, quantity, average_cost').eq('portfolio_id', portfolio.id).eq('status', 'open'),
    supabase.from('manual_assets').select('*').eq('portfolio_id', portfolio.id), supabase.from('liabilities').select('*').eq('portfolio_id', portfolio.id),
    supabase.rpc('get_newest_projection_snapshot_baseline', { p_portfolio_id: portfolio.id }),
  ])
  if (accounts.error || positions.error || assets.error || liabilities.error || snapshot.error) throw new Error('Future projection unavailable')
  return { portfolio, accounts: accountResponseSchema.parse(accounts.data), positions: openPositionResponseSchema.parse(positions.data), assets: manualAssetResponseSchema.parse(assets.data), liabilities: liabilityResponseSchema.parse(liabilities.data), snapshot: z.array(z.object({ as_of_date: z.string(), investment_value: decimal, manual_asset_value: decimal, liability_value: decimal })).parse(snapshot.data).at(0) ?? null }
}

function Chart({ paths, mode }: { paths: { name: string; points: ReturnType<typeof project> }[]; mode: 'nominal' | 'real' }) {
  const maximum = Math.max(...paths.flatMap((path) => path.points.map((point) => Number(mode === 'nominal' ? point.nominal : point.real))), 1)
  return <div className="projection-chart-wrap"><svg className="projection-chart" viewBox="0 0 800 250" role="img" aria-label={`${mode === 'nominal' ? 'Nominal' : 'Inflation-adjusted'} projected net worth comparison`}><line x1="42" x2="780" y1="210" y2="210" className="history-axis" />{paths.map((path, index) => { const d = path.points.map((point, i) => `${i ? 'L' : 'M'} ${42 + i * 738 / Math.max(1, path.points.length - 1)} ${210 - Number(mode === 'nominal' ? point.nominal : point.real) / maximum * 175}`).join(' '); return <g key={path.name}><path d={d} className={`projection-line p${index}`} /><text x="780" y={26 + index * 16}>{path.name}</text></g> })}</svg></div>
}

export function FuturePage() {
  const data = useQuery({ queryKey: ['projection-baseline'], queryFn: load }); const d = data.data
  const included = d?.positions.filter((p) => d.accounts.find((a) => a.id === p.account_id)?.include_in_net_worth) ?? []; const quotes = useQuotes(d?.portfolio.id, included.map((p) => p.symbol))
  const [source, setSource] = useState<'live' | 'recorded'>('live'); const [selected, setSelected] = useState<string[]>(['0', '625', '1000']); const [custom, setCustom] = useState('1500'); const [mode, setMode] = useState<'nominal' | 'real'>('nominal'); const [investmentRate, setInvestmentRate] = useState('7'); const [inflationRate, setInflationRate] = useState('2.5'); const [years, setYears] = useState('30')
  if (data.isPending || (quotes.isPending && included.length)) return <LoadingState>Loading your projection baseline…</LoadingState>
  if (data.isError || quotes.isError || !d) return <ErrorState onRetry={() => { void data.refetch(); void quotes.refetch() }} />
  const bySymbol = new Map((quotes.data ?? []).map((q) => [q.symbol, q])); const missing = included.filter((p) => !bySymbol.get(p.symbol)?.price)
  const investments = sumDecimals(included.flatMap((p) => { const price = bySymbol.get(p.symbol)?.price; return price ? [marketValue(p.quantity, price)] : [] })); const assets = sumDecimals(d.assets.filter((a) => a.include_in_net_worth && (!a.account_id || d.accounts.find((x) => x.id === a.account_id)?.include_in_net_worth)).map((a) => a.current_value)); const liabilities = sumDecimals(d.liabilities.filter((a) => a.include_in_net_worth && (!a.account_id || d.accounts.find((x) => x.id === a.account_id)?.include_in_net_worth)).map((a) => a.outstanding_balance))
  const baseline: ProjectionBaseline = source === 'recorded' && d.snapshot ? { investments: d.snapshot.investment_value, assets: d.snapshot.manual_asset_value, liabilities: d.snapshot.liability_value, yearMonth: d.snapshot.as_of_date.slice(0, 7) } : { investments, assets, liabilities, yearMonth: new Date().toISOString().slice(0, 7) }
  const parsed = assumptionsSchema.safeParse({ investmentRate, inflationRate, years, custom }); const assumptions = parsed.success ? { investmentRate, assetRate: inflationRate, inflationRate, years: parsed.data.years } : null
  const choices = presets.filter((p) => selected.includes(p.value ?? 'custom')).map((p) => ({ ...p, value: p.value ?? custom })).filter((p) => decimal.safeParse(p.value).success).slice(0, 3); const paths = assumptions ? choices.map((choice) => ({ name: choice.name, points: project(baseline, assumptions, choice.value) })) : []
  const netWorth = subtractDecimals(sumDecimals([baseline.investments, baseline.assets]), baseline.liabilities)
  const milestones = paths[0]?.points ? standardMilestones.filter((target) => BigInt(target) > BigInt(netWorth.split('.')[0] ?? '0')).slice(0, 3).map((target) => ({ target, point: paths[0]!.points.find((point) => BigInt(point.nominal.split('.')[0] ?? '0') >= BigInt(target)) ?? null })) : []
  return <section className="future-page"><header className="page-header"><div><h1>Future, under stated assumptions.</h1><p>{source === 'recorded' && d.snapshot ? `Projected from recorded net worth of ${formatUsd(netWorth)} on ${d.snapshot.as_of_date}.` : `Projected from live net worth of ${formatUsd(netWorth)} as of now.`}</p></div></header>
    <section className="projection-controls"><div><h2>Baseline</h2><label><select value={source} onChange={(e) => setSource(e.target.value as 'live' | 'recorded')}><option value="live">Live current value</option><option value="recorded" disabled={!d.snapshot}>Recorded snapshot{d.snapshot ? ` · ${d.snapshot.as_of_date}` : ' unavailable'}</option></select></label><p>Investments {formatUsd(baseline.investments)} · Non-investment assets {formatUsd(baseline.assets)} · Liabilities −{formatUsd(baseline.liabilities)}</p></div><div><h2>Assumptions</h2><label>Investment return (%)<input value={investmentRate} onChange={(e) => setInvestmentRate(e.target.value)} /></label><label>Inflation (%)<input value={inflationRate} onChange={(e) => setInflationRate(e.target.value)} /></label><label>Non-investment asset growth (%)<input value={inflationRate} readOnly aria-label="Non-investment asset growth equals inflation" /></label><p>Matches inflation by default, holding real value without a directional price bet. Liabilities are held flat.</p><label>Horizon (years)<input value={years} onChange={(e) => setYears(e.target.value)} /></label></div></section>
    {missing.length ? <p className="quote-warning">Incomplete — {missing.map((p) => p.symbol).join(', ')} {missing.length === 1 ? 'is' : 'are'} excluded because no current price is available.</p> : null}
    <section className="projection-compare"><h2>Compare contribution paths</h2><div className="projection-presets">{presets.map((preset) => { const value = preset.value ?? 'custom'; return <label key={value} className="checkbox-row"><input type="checkbox" checked={selected.includes(value)} onChange={() => setSelected((current) => current.includes(value) ? current.filter((x) => x !== value) : current.length < 3 ? [...current, value] : current)} />{preset.name}{preset.value === null && <input value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom monthly contribution" />}</label> })}</div><p>Select two or three paths to compare.</p><div className="history-periods"><button className={mode === 'nominal' ? 'active' : ''} onClick={() => setMode('nominal')}>Nominal</button><button className={mode === 'real' ? 'active' : ''} onClick={() => setMode('real')}>Inflation-adjusted</button></div>{paths.length >= 2 ? <Chart paths={paths} mode={mode} /> : <p className="form-error">Select at least two valid contribution paths.</p>}</section>
    {milestones.length ? <section className="projection-table"><h2>Next milestones</h2>{milestones.map(({ target, point }) => <p key={target}>{point ? `Projected to reach ${formatUsd(target)} in ${point.yearMonth} under ${paths[0]!.name}.` : `${formatUsd(target)} is not projected within this horizon.`}</p>)}</section> : null}
    {paths.length ? <section className="projection-table"><h2>Annual projection</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Point</th>{paths.map((p) => <th key={p.name}>{p.name}</th>)}</tr></thead><tbody>{paths[0]!.points.map((point, index) => <tr key={point.month}><td>Year {point.month / 12} · {point.yearMonth}</td>{paths.map((path) => <td key={path.name}>{formatUsd(mode === 'nominal' ? path.points[index]!.nominal : path.points[index]!.real)}</td>)}</tr>)}</tbody></table></div></section> : null}</section>
}
