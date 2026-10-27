import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { formatUsd } from '@/features/portfolio/prices'
import { portfolioResponseSchema } from '@/lib/validation'
import { supabase } from '@/lib/supabase'
import { RecordedNetWorthChart } from './RecordedNetWorthChart'
import { dateLabel, loadHistory, loadSnapshotDetail, RecordedSnapshotDetailContractError } from './data'

const dateParameter = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

async function loadPortfolio() {
  const { data, error } = await supabase.rpc('ensure_primary_portfolio')
  if (error) throw error
  return portfolioResponseSchema.parse([data])[0]!
}

function monthLabel(month: Date) { return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month) }
function monthStart(value: string) { return new Date(`${value.slice(0, 7)}-01T12:00:00Z`) }
function shiftMonth(value: Date, amount: number) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1, 12)) }
function sameMonth(date: string, month: Date) { const value = monthStart(date); return value.getUTCFullYear() === month.getUTCFullYear() && value.getUTCMonth() === month.getUTCMonth() }

export function HistoryPage() {
  const [params, setParams] = useSearchParams()
  const portfolio = useQuery({ queryKey: ['history-portfolio'], queryFn: loadPortfolio })
  const history = useQuery({ queryKey: ['recorded-history', portfolio.data?.id, null], queryFn: () => loadHistory(portfolio.data!.id, null), enabled: Boolean(portfolio.data) })
  const rawDate = params.get('date')
  const requestedDate = dateParameter.safeParse(rawDate).success ? rawDate! : null
  const snapshots = history.data ?? []
  const selected = snapshots.find((snapshot) => snapshot.as_of_date === requestedDate) ?? snapshots.at(-1) ?? null
  const [visibleMonth, setVisibleMonth] = useState<Date | null>(null)
  const detail = useQuery({ queryKey: ['recorded-snapshot-detail', portfolio.data?.id, selected?.id], queryFn: () => loadSnapshotDetail(portfolio.data!.id, selected!.id), enabled: Boolean(portfolio.data && selected) })

  useEffect(() => { if (selected && !visibleMonth) setVisibleMonth(monthStart(selected.as_of_date)) }, [selected, visibleMonth])
  const dateWasUnavailable = Boolean(snapshots.length && rawDate && (!requestedDate || !snapshots.some((snapshot) => snapshot.as_of_date === requestedDate)))
  const monthSnapshots = useMemo(() => visibleMonth ? snapshots.filter((snapshot) => sameMonth(snapshot.as_of_date, visibleMonth)) : [], [snapshots, visibleMonth])
  const select = (date: string) => { setParams({ date }); setVisibleMonth(monthStart(date)) }

  if (portfolio.isPending || (Boolean(portfolio.data) && history.isPending)) return <LoadingState>Loading recorded portfolio history...</LoadingState>
  if (portfolio.isError || history.isError || !portfolio.data) return <ErrorState onRetry={() => { void portfolio.refetch(); void history.refetch() }} />

  return <section className="history-page">
    <header className="page-header"><div><h1>Portfolio Time Machine</h1><p>Select an exact recorded portfolio state. Current holdings and quotes are never substituted.</p></div></header>
    {dateWasUnavailable && <p className="history-status" role="status">That date has no recorded snapshot. Showing the newest recorded snapshot instead.</p>}
    {!snapshots.length ? <p className="history-empty">No recorded snapshots yet. Save or add a verified historical snapshot to begin your history.</p> : <>
      {selected && <section className="time-machine-reading" aria-live="polite"><p>As of {dateLabel(selected.as_of_date)}</p><strong>{formatUsd(selected.total_net_worth)}</strong><span>Recorded snapshot · XNYS close · {selected.source}</span></section>}
      {visibleMonth && <section className="month-picker" aria-labelledby="recorded-date-heading"><div className="month-picker-heading"><h2 id="recorded-date-heading">Recorded date</h2><div><button type="button" className="button button-secondary" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))} aria-label="Previous month">Previous month</button><strong aria-live="polite">{monthLabel(visibleMonth)}</strong><button type="button" className="button button-secondary" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))} aria-label="Next month">Next month</button></div></div>{monthSnapshots.length ? <div className="recorded-days" role="list" aria-label={`Recorded snapshots in ${monthLabel(visibleMonth)}`}>{monthSnapshots.map((snapshot) => <button key={snapshot.id} type="button" className={snapshot.id === selected?.id ? 'active' : ''} onClick={() => select(snapshot.as_of_date)} aria-label={`Select recorded snapshot for ${dateLabel(snapshot.as_of_date)}, ${formatUsd(snapshot.total_net_worth)}`}><span>{snapshot.as_of_date.slice(8)}</span><small>{formatUsd(snapshot.total_net_worth)}</small></button>)}</div> : <p className="history-empty">No recorded snapshots in {monthLabel(visibleMonth)}.</p>}</section>}
      <RecordedNetWorthChart portfolioId={portfolio.data.id} selectedId={selected?.id} onSelect={(snapshot) => select(snapshot.as_of_date)} />
      {detail.isPending ? <LoadingState>Loading this recorded snapshot...</LoadingState> : detail.isError ? <ErrorState onRetry={() => void detail.refetch()}>{detail.error instanceof RecordedSnapshotDetailContractError ? 'We received this recorded snapshot, but could not verify its details.' : undefined}</ErrorState> : detail.data ? <RecordedDetail detail={detail.data} /> : null}
    </>}
  </section>
}

function RecordedDetail({ detail }: { detail: Awaited<ReturnType<typeof loadSnapshotDetail>> }) {
  const snapshot = detail.snapshot
  return <section className="recorded-detail" aria-labelledby="recorded-detail-title"><h2 id="recorded-detail-title">Recorded composition</h2><p className="recorded-provenance">Recorded snapshot from {snapshot.source} at {snapshot.exchange_mic} market close. Values below are immutable recorded facts.</p><div className="recorded-totals"><span>Investments<strong>{formatUsd(snapshot.investment_value)}</strong></span><span>Manual assets<strong>{formatUsd(snapshot.manual_asset_value)}</strong></span><span>Liabilities<strong>−{formatUsd(snapshot.liability_value)}</strong></span><span>Net worth<strong>{formatUsd(snapshot.total_net_worth)}</strong></span></div><h3>Holdings</h3>{detail.positions.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Holding</th><th>Quantity</th><th>Recorded price</th><th>Recorded value</th><th>Cost basis</th><th>Gain / loss</th><th>Allocation</th></tr></thead><tbody>{detail.positions.map((position) => <tr key={`${position.account_label}-${position.symbol}`}><td><strong>{position.symbol}</strong><small>{position.security_name} · {position.account_label} · {position.price_kind === 'manual' ? 'Manual price' : position.price_kind === 'estimate' ? 'Estimated price' : 'Recorded close'} ({position.price_source})</small></td><td>{position.quantity}</td><td>{formatUsd(position.market_price)}</td><td>{formatUsd(position.market_value)}</td><td>{formatUsd(position.cost_basis)}</td><td>{position.unrealized_gain.startsWith('-') ? '↘ ' : '↗ +'}{formatUsd(position.unrealized_gain.replace('-', ''))}</td><td>{position.portfolio_weight}</td></tr>)}</tbody></table></div> : <p className="history-empty">No recorded investment holdings for this snapshot.</p>}<ValueItems title="Manual assets" items={detail.manual_assets} /><ValueItems title="Liabilities" items={detail.liabilities} /></section>
}

type RecordedValueItem = { name: string; category: string; account_label: string | null; value: string; include_in_net_worth: boolean }

function ValueItems({ title, items }: { title: string; items: RecordedValueItem[] }) {
  return <section className="recorded-value-items"><h3>{title}</h3>{items.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Category</th><th>Account</th><th>Recorded value</th><th>Net worth</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.name}-${item.category}`}><td>{item.name}</td><td>{item.category}</td><td>{item.account_label ?? 'No account'}</td><td>{formatUsd(item.value)}</td><td>{item.include_in_net_worth ? 'Included' : 'Excluded'}</td></tr>)}</tbody></table></div> : <p className="history-empty">No recorded {title.toLowerCase()} for this snapshot.</p>}</section>
}
