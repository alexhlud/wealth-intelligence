import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { formatUsd } from '@/features/portfolio/prices'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { dateLabel, loadHistory, periods, rangeStart, type Period, type RecordedSnapshot } from './data'


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

export function RecordedNetWorthChart({ portfolioId, selectedId: controlledSelectedId, onSelect }: { portfolioId: string; selectedId?: string | null; onSelect?: (snapshot: RecordedSnapshot) => void }) {
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
  const selected = displayed.find((point) => point.id === controlledSelectedId || point.id === selectedId) ?? displayed.at(-1) ?? null
  const points = useMemo(() => displayed.length ? coordinates(displayed) : [], [displayed])

  useEffect(() => { if (selected && selected.id !== selectedId && !controlledSelectedId) setSelectedId(selected.id) }, [selected, selectedId, controlledSelectedId])
  if (allResult.isPending || (period !== 'ALL' && ranged.isPending)) return <LoadingState>Loading recorded net-worth history...</LoadingState>
  if (allResult.isError || ranged.isError) return <ErrorState onRetry={() => { void allResult.refetch(); void ranged.refetch() }} />

  return <section className="recorded-history" aria-labelledby="recorded-history-title">
    <div className="history-heading"><div><h2 id="recorded-history-title">Recorded net worth</h2><p>Stored snapshots only. This is not a daily performance series.</p></div><Link to={selected ? `/history?date=${selected.as_of_date}` : '/history'}>Open Time Machine</Link></div>
    <div className="history-periods" role="group" aria-label="Recorded history period">{periods.map((item) => <button key={item} type="button" className={item === period ? 'active' : ''} onClick={() => setPeriod(item)} aria-pressed={item === period}>{item}</button>)}</div>
    {preview && <p className="history-review">Review preview — rendering the {preview === 'empty' ? 'empty' : 'one-point'} state without changing snapshots.</p>}
    {selected ? <div className="history-reading" aria-live="polite"><span>Recorded snapshot · {dateLabel(selected.as_of_date)}</span><strong>{formatUsd(selected.total_net_worth)}</strong><small>XNYS close · pinned until you select another recorded marker</small></div> : null}
    {!displayed.length ? <p className="history-empty">No recorded snapshots yet. Save or add a verified historical snapshot to begin your history.</p> : <>
      {displayed.length === 1 ? <p className="history-empty">One recorded snapshot — a trend begins with a second recorded date.</p> : <p className="history-connector-note">Dashed connector joins recorded snapshots only; no daily values are estimated between them.</p>}
      <svg className="history-chart" viewBox="0 0 800 240" role="img" aria-label="Recorded net worth by stored snapshot date">
        <line x1="40" x2="760" y1="208" y2="208" className="history-axis" />
        {points.length > 1 ? <path d={points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} className="history-connector" aria-hidden="true" pointerEvents="none" /> : null}
        {points.map((point) => <g key={point.id}><circle cx={point.x} cy={point.y} r="6" className={point.id === selected?.id ? 'history-point selected' : 'history-point'} /><foreignObject x={point.x - 18} y={point.y - 18} width="36" height="36"><button type="button" className="history-point-button" onClick={() => { setSelectedId(point.id); onSelect?.(point) }} aria-label={`Select recorded snapshot for ${dateLabel(point.as_of_date)}, ${formatUsd(point.total_net_worth)}`} /></foreignObject><text x={point.x} y="230" textAnchor="middle">{point.as_of_date.slice(5)}</text></g>)}
      </svg>
    </>}
  </section>
}
