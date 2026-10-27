import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatQuantity, formatUsd, marketValue, subtractDecimals } from '@/features/portfolio/prices'
import { compareRecordedHoldings, compareRecordedValues, dateLabel, loadSnapshotDetail, type RecordedSnapshot } from './data'

function signed(value: string, formatter: (value: string) => string) {
  if (value === '0') return `No change · ${formatter(value)}`
  return `${value.startsWith('-') ? '↘ −' : '↗ +'}${formatter(value.replace('-', ''))}`
}

function allocationPoints(value: string) {
  if (value === '0') return 'No allocation change'
  return `${value.startsWith('-') ? '↘ −' : '↗ +'}${formatQuantity(marketValue(value.replace('-', ''), '100'))} pts`
}

export function RecordedDateComparison({ portfolioId, snapshots, pinnedId }: { portfolioId: string; snapshots: RecordedSnapshot[]; pinnedId: string | null }) {
  const [open, setOpen] = useState(false)
  const [earlierId, setEarlierId] = useState<string | null>(null)
  const [laterId, setLaterId] = useState<string | null>(null)
  const pinnedIndex = snapshots.findIndex((snapshot) => snapshot.id === pinnedId)

  useEffect(() => {
    if (!snapshots.length || earlierId || laterId) return
    const defaultEarlier = pinnedIndex >= 0 && pinnedIndex < snapshots.length - 1 ? snapshots[pinnedIndex]! : snapshots.at(-2) ?? null
    setEarlierId(defaultEarlier?.id ?? null)
    setLaterId(snapshots.at(-1)?.id ?? null)
  }, [snapshots, pinnedIndex, earlierId, laterId])

  const earlier = snapshots.find((snapshot) => snapshot.id === earlierId) ?? null
  const later = snapshots.find((snapshot) => snapshot.id === laterId) ?? null
  const earlierDetail = useQuery({ queryKey: ['recorded-snapshot-detail', portfolioId, earlier?.id], queryFn: () => loadSnapshotDetail(portfolioId, earlier!.id), enabled: open && Boolean(earlier) })
  const laterDetail = useQuery({ queryKey: ['recorded-snapshot-detail', portfolioId, later?.id], queryFn: () => loadSnapshotDetail(portfolioId, later!.id), enabled: open && Boolean(later) })
  const holdings = useMemo(() => earlierDetail.data && laterDetail.data ? compareRecordedHoldings(earlierDetail.data, laterDetail.data) : [], [earlierDetail.data, laterDetail.data])

  return <section className="recorded-comparison" aria-labelledby="recorded-comparison-title">
    <div className="comparison-heading"><div><h2 id="recorded-comparison-title">Compare recorded dates</h2><p>Recorded change between these snapshots. This is not gain, return, or performance attribution.</p></div><button type="button" className="button button-secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? 'Close comparison' : 'Compare recorded dates'}</button></div>
    {open && (snapshots.length < 2 ? <p className="history-empty">Comparison requires two recorded dates. The exact selected snapshot remains available above.</p> : <>
      <div className="comparison-pickers">
        <label>Earlier<select value={earlierId ?? ''} onChange={(event) => setEarlierId(event.target.value)}>{snapshots.slice(0, -1).map((snapshot) => <option key={snapshot.id} value={snapshot.id} disabled={Boolean(later && snapshot.as_of_date >= later.as_of_date)}>{dateLabel(snapshot.as_of_date)} · XNYS close</option>)}</select></label>
        <label>Later<select value={laterId ?? ''} onChange={(event) => setLaterId(event.target.value)}>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id} disabled={snapshot.id === earlierId || Boolean(earlier && snapshot.as_of_date <= earlier.as_of_date)}>{dateLabel(snapshot.as_of_date)} · XNYS close</option>)}</select></label>
      </div>
      {!earlier || !later || later.as_of_date <= earlier.as_of_date ? <p className="history-status">Choose an earlier and a later recorded date.</p> : earlierDetail.isPending || laterDetail.isPending ? <p className="state-copy">Loading recorded comparison...</p> : earlierDetail.isError || laterDetail.isError ? <p className="form-error">The recorded comparison could not be loaded. Try again.</p> : earlierDetail.data && laterDetail.data ? <ComparisonFacts earlier={earlierDetail.data} later={laterDetail.data} holdings={holdings} /> : null}
    </>)}
  </section>
}

function ComparisonFacts({ earlier, later, holdings }: { earlier: Awaited<ReturnType<typeof loadSnapshotDetail>>; later: Awaited<ReturnType<typeof loadSnapshotDetail>>; holdings: ReturnType<typeof compareRecordedHoldings> }) {
  const totals = [{ label: 'Investments', earlier: earlier.snapshot.investment_value, later: later.snapshot.investment_value }, { label: 'Net worth', earlier: earlier.snapshot.total_net_worth, later: later.snapshot.total_net_worth }]
  const groups = ['added', 'removed', 'increased', 'reduced', 'unchanged'] as const
  return <div className="comparison-facts"><p className="comparison-dates">Earlier: {dateLabel(earlier.snapshot.as_of_date)} · XNYS close &nbsp; Later: {dateLabel(later.snapshot.as_of_date)} · XNYS close</p><div className="comparison-totals">{totals.map((total) => { const change = subtractDecimals(total.later, total.earlier); return <span key={total.label}><small>{total.label}</small><strong>{formatUsd(total.earlier)} → {formatUsd(total.later)}</strong><em className={change.startsWith('-') ? 'negative' : change === '0' ? '' : 'positive'}>{signed(change, formatUsd)}</em></span> })}</div><h3>Recorded holdings</h3>{groups.map((group) => { const rows = holdings.filter((holding) => holding.kind === group); return rows.length ? <section key={group} className="comparison-group"><h4>{group[0]!.toUpperCase() + group.slice(1)}</h4><div className="table-wrap"><table className="data-table"><thead><tr><th>Holding</th><th>Quantity</th><th>Value change</th><th>Allocation change</th></tr></thead><tbody>{rows.map((row) => { const holding = row.later ?? row.earlier!; return <tr key={row.key}><td><strong>{holding.symbol}</strong><small>{holding.security_name} · {holding.account_label}</small></td><td>{row.earlier && row.later ? <>{formatQuantity(row.earlier.quantity)} → {formatQuantity(row.later.quantity)}<small>{signed(row.quantityChange!, formatQuantity)}</small></> : row.earlier ? <> {formatQuantity(row.earlier.quantity)} → Absent later</> : <>Absent earlier → {formatQuantity(row.later!.quantity)}</>}</td><td>{row.valueChange ? signed(row.valueChange, formatUsd) : 'Not comparable — absent side'}</td><td>{row.allocationPointChange ? allocationPoints(row.allocationPointChange) : 'Not comparable — absent side'}</td></tr> })}</tbody></table></div></section> : null })}<RecordedValueSection title="Manual assets" earlier={earlier.manual_assets} later={later.manual_assets} /><RecordedValueSection title="Liabilities" earlier={earlier.liabilities} later={later.liabilities} /></div>
}

type ComparableValue = { name: string; category: string; account_label: string | null; value: string; include_in_net_worth: boolean; effective_at: string }

function RecordedValueSection({ title, earlier, later }: { title: string; earlier: readonly ComparableValue[]; later: readonly ComparableValue[] }) {
  const changes = compareRecordedValues(earlier, later)
  return <section className="comparison-group"><h3>{title}</h3>{changes.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Earlier recorded value</th><th>Later recorded value</th><th>Recorded value change</th></tr></thead><tbody>{changes.map((change) => <tr key={change.key}><td><strong>{change.name}</strong><small>{change.category} · {change.accountLabel ?? 'No account'}</small></td><td>{change.earlier ? formatUsd(change.earlier) : 'Absent earlier'}</td><td>{change.later ? formatUsd(change.later) : 'Absent later'}</td><td>{change.change ? signed(change.change, formatUsd) : 'Not comparable — absent side'}</td></tr>)}</tbody></table></div> : <p className="history-empty">No recorded {title.toLowerCase()} on either selected date.</p>}</section>
}
