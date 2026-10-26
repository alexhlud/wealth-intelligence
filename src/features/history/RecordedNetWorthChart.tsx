import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { formatUsd } from '@/features/portfolio/prices'
import { ErrorState, LoadingState } from '@/components/ui/States'

const decimal = z.union([z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/), z.number().finite()]).transform(String)
const snapshotSchema = z.object({
  id: z.string().uuid(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  market_close_at: z.string().min(1),
  total_net_worth: decimal,
  created_at: z.string().min(1),
  source: z.string(),
})
const snapshotsSchema = z.array(snapshotSchema)
export type RecordedSnapshot = z.infer<typeof snapshotSchema>
type Period = '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'
const periods: Period[] = ['1M', '3M', '6M', '1Y', 'YTD', 'ALL']

function rangeStart(period: Period, latest: string): string | null {
  if (period === 'ALL') return null
  const [year, month, day] = latest.split('-').map(Number)
  if (period === 'YTD') return `${year}-01-01`
  const months = period === '1M' ? 1 : period === '3M' ? 3 : period === '6M' ? 6 : 12
  const date = new Date(Date.UTC(year, month - 1 - months, day))
  return date.toISOString().slice(0, 10)
}

async function loadHistory(portfolioId: string, startDate: string | null) {
  const { data, error } = await supabase.rpc('list_recorded_snapshot_history', { p_portfolio_id: portfolioId, p_start_date: startDate })
  if (error) throw error
  const parsed = snapshotsSchema.safeParse(data)
  if (!parsed.success) throw new Error(parsed.error.message)
  return parsed.data
}

function decimalInteger(value: string, scale: number) {
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const integer = BigInt(`${whole}${fraction.padEnd(scale, '0')}`)
  return negative ? -integer : integer
}

function coordinates(points: RecordedSnapshot[]) {
  const scale = Math.max(...points.map((point) => point.total_net_worth.split('.')[1]?.length ?? 0))
  const values = points.map((point) => decimalInteger(point.total_net_worth, scale))
  const minimum = values.reduce((lowest, value) => value < lowest ? value : lowest)
  const maximum = values.reduce((highest, value) => value > highest ? value : highest)
  const range = maximum - minimum || 1n
  const width = 720n
  const height = 180n
  return points.map((point, index) => ({
    ...point,
    x: 40 + Number((BigInt(index) * width) / BigInt(Math.max(1, points.length - 1))),
    y: 28 + Number(((maximum - values[index]!) * height) / range),
  }))
}

function dateLabel(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' }).format(new Date(`${value}T12:00:00Z`)) }

export function RecordedNetWorthChart({ portfolioId }: { portfolioId: string }) {
  const [period, setPeriod] = useState<Period>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [params] = useSearchParams()
  const preview = params.get('historyPreview') === 'empty' ? 'empty' : params.get('historyPreview') === 'one' ? 'one' : null
  const all = useMemo(() => ({ queryKey: ['recorded-history', portfolioId, null], queryFn: () => loadHistory(portfolioId, null) }), [portfolioId])
  // This local query avoids deriving a recent window by downloading every snapshot.
  const allResult = useQuery(all)
  const latestDate = allResult.data?.at(-1)?.as_of_date ?? null
  const start = latestDate ? rangeStart(period, latestDate) : null
  const ranged = useQuery({ queryKey: ['recorded-history', portfolioId, start], queryFn: () => loadHistory(portfolioId, start), enabled: Boolean(latestDate) })
  const actual = period === 'ALL' ? (allResult.data ?? []) : (ranged.data ?? [])
  const displayed = preview === 'empty' ? [] : preview === 'one' ? actual.slice(0, 1) : actual
  const selected = displayed.find((point) => point.id === selectedId) ?? displayed.at(-1) ?? null
  const points = useMemo(() => displayed.length ? coordinates(displayed) : [], [displayed])

  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id) }, [selected, selectedId])
  if (allResult.isPending || (period !== 'ALL' && ranged.isPending)) return <LoadingState>Loading recorded net-worth history...</LoadingState>
  if (allResult.isError || ranged.isError) return <ErrorState onRetry={() => { void allResult.refetch(); void ranged.refetch() }} />

  return <section className="recorded-history" aria-labelledby="recorded-history-title">
    <div className="history-heading"><div><h2 id="recorded-history-title">Recorded net worth</h2><p>Stored snapshots only. This is not a daily performance series.</p></div><Link to="/snapshots">View snapshots</Link></div>
    <div className="history-periods" role="group" aria-label="Recorded history period">{periods.map((item) => <button key={item} type="button" className={item === period ? 'active' : ''} onClick={() => setPeriod(item)} aria-pressed={item === period}>{item}</button>)}</div>
    {preview && <p className="history-review">Review preview — rendering the {preview === 'empty' ? 'empty' : 'one-point'} state without changing snapshots.</p>}
    {selected ? <div className="history-reading" aria-live="polite"><span>Recorded snapshot · {dateLabel(selected.as_of_date)}</span><strong>{formatUsd(selected.total_net_worth)}</strong><small>XNYS close · pinned until you select another recorded marker</small></div> : null}
    {!displayed.length ? <p className="history-empty">No recorded snapshots yet. Save or add a verified historical snapshot to begin your history.</p> : <>
      {displayed.length === 1 ? <p className="history-empty">One recorded snapshot — a trend begins with a second recorded date.</p> : <p className="history-connector-note">Dashed connector joins recorded snapshots only; no daily values are estimated between them.</p>}
      <svg className="history-chart" viewBox="0 0 800 240" role="img" aria-label="Recorded net worth by stored snapshot date">
        <line x1="40" x2="760" y1="208" y2="208" className="history-axis" />
        {points.length > 1 ? <path d={points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} className="history-connector" aria-hidden="true" pointerEvents="none" /> : null}
        {points.map((point) => <g key={point.id}><circle cx={point.x} cy={point.y} r="6" className={point.id === selected?.id ? 'history-point selected' : 'history-point'} /><foreignObject x={point.x - 18} y={point.y - 18} width="36" height="36"><button type="button" className="history-point-button" onClick={() => setSelectedId(point.id)} aria-label={`Select recorded snapshot for ${dateLabel(point.as_of_date)}, ${formatUsd(point.total_net_worth)}`} /></foreignObject><text x={point.x} y="230" textAnchor="middle">{point.as_of_date.slice(5)}</text></g>)}
      </svg>
    </>}
  </section>
}
