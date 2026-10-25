import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { supabase } from '@/lib/supabase'
import { formatUsd } from '@/features/portfolio/prices'

const snapshotSchema = z.object({ id: z.string().uuid(), corrects_snapshot_id: z.string().uuid().nullable(), as_of_date: z.string(), market_close_at: z.string().datetime({ offset: true }), source: z.string(), investment_value: z.union([z.string(), z.number()]).transform(String), total_net_worth: z.union([z.string(), z.number()]).transform(String), created_at: z.string().datetime({ offset: true }) })
const previewSchema = z.object({ kind: z.enum(['ready', 'already_recorded', 'unavailable', 'saved']), session: z.object({ asOfDate: z.string(), marketCloseAt: z.string().datetime({ offset: true }), closeTimeEt: z.enum(['13:00', '16:00']) }).optional(), positionCount: z.number().optional(), manualAssetCount: z.number().optional(), liabilityCount: z.number().optional(), snapshotId: z.string().optional(), reason: z.enum(['no_session', 'outside_capture_window', 'state_changed_after_close', 'price_unavailable', 'no_eligible_facts']).optional() })

type Snapshot = z.infer<typeof snapshotSchema>

async function getPortfolio() { const { data, error } = await supabase.rpc('ensure_primary_portfolio'); if (error) throw error; return z.object({ id: z.string().uuid() }).parse(data) }
async function getSnapshots(portfolioId: string) {
  const { data, error } = await supabase.from('portfolio_snapshots').select('id, corrects_snapshot_id, as_of_date, market_close_at, source, investment_value, total_net_worth, created_at').eq('portfolio_id', portfolioId).order('as_of_date', { ascending: false })
  if (error) throw error
  const rows = z.array(snapshotSchema).parse(data)
  const superseded = new Set(rows.flatMap((row) => row.corrects_snapshot_id ? [row.corrects_snapshot_id] : []))
  return rows.filter((row) => !superseded.has(row.id))
}

function sessionLabel(snapshot: { as_of_date: string; market_close_at: string }) {
  const close = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(snapshot.market_close_at))
  return `XNYS close · ${close} ET`
}

function unavailableCopy(reason?: string) {
  if (reason === 'outside_capture_window') return 'The next XNYS session has started or calendar coverage has ended. Use historical backfill when it becomes available.'
  if (reason === 'state_changed_after_close') return 'Your current facts changed after this close. Recording them as an earlier session would be inaccurate.'
  if (reason === 'price_unavailable') return 'A fresh current quote was unavailable for at least one holding. No snapshot was saved.'
  if (reason === 'no_eligible_facts') return 'Add an included holding, asset, or liability before saving a snapshot.'
  return 'There is no completed XNYS session available to save.'
}

export function SaveSnapshotDialog({ portfolioId, onClose }: { portfolioId: string; onClose: () => void }) {
  const client = useQueryClient(); const navigate = useNavigate(); const [preview, setPreview] = useState<z.infer<typeof previewSchema> | null>(null); const [error, setError] = useState<'generic' | 'mfa_required' | null>(null)
  const load = useMutation({ mutationFn: async () => { const { data, error } = await supabase.functions.invoke('market-data', { body: { operation: 'snapshot_preview', portfolioId } }); if (error) throw error; return previewSchema.parse(data.snapshot) }, onSuccess: setPreview, onError: () => setError('generic') })
  const save = useMutation({ mutationFn: async () => { const { data, error } = await supabase.functions.invoke('market-data', { body: { operation: 'save_snapshot', portfolioId, requestId: crypto.randomUUID() } }); if (error) throw error; return previewSchema.parse(data.snapshot) }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['snapshots', portfolioId] }); onClose() }, onError: async (saveError) => { const response = (saveError as { context?: Response }).context; const body = response ? await response.clone().json().catch(() => null) : null; setError(body?.reason === 'mfa_required' ? 'mfa_required' : 'generic') } })
  const errorMessage = error === 'mfa_required' ? 'Your secure session needs verification before a snapshot can be saved.' : error ? 'We could not save the snapshot. Please try again.' : null
  return <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-snapshot-title"><h2 id="save-snapshot-title">Save snapshot</h2>{!preview && <><p>Prepare a record for the latest completed XNYS session. Prices are freshly fetched after close; this never uses a cached quote.</p>{errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}<div className="dialog-actions"><Button className="button-secondary" onClick={onClose}>Cancel</Button><Button className="button-primary" onClick={() => load.mutate()} disabled={load.isPending}>{load.isPending ? 'Checking…' : 'Prepare snapshot'}</Button></div></>}{preview?.kind === 'ready' && <><p>{sessionLabel({ as_of_date: preview.session!.asOfDate, market_close_at: preview.session!.marketCloseAt })}</p><p>{preview.positionCount} position{preview.positionCount === 1 ? '' : 's'}, {preview.manualAssetCount} manual asset{preview.manualAssetCount === 1 ? '' : 's'}, and {preview.liabilityCount} liabilit{preview.liabilityCount === 1 ? 'y' : 'ies'} will be recorded.</p><p>Security prices will be labelled “Captured from current quote after close,” with the snapshot capture time retained in the record.</p>{errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}<div className="dialog-actions"><Button className="button-secondary" onClick={onClose}>Cancel</Button>{error === 'mfa_required' ? <Button className="button-primary" onClick={() => navigate('/auth/mfa')}>Verify session</Button> : <Button className="button-primary" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save snapshot'}</Button>}</div></>}{preview?.kind === 'already_recorded' && <><p>This XNYS session is already recorded.</p><div className="dialog-actions"><Button className="button-secondary" onClick={onClose}>Close</Button><Link className="button button-primary" to="/snapshots">View snapshots</Link></div></>}{preview?.kind === 'unavailable' && <><p className="form-error" role="alert">{unavailableCopy(preview.reason)}</p><div className="dialog-actions"><Button className="button-secondary" onClick={onClose}>Close</Button></div></>}</section></div>
}

export function SnapshotsPage() {
  const portfolio = useQuery({ queryKey: ['primary-portfolio'], queryFn: getPortfolio })
  const snapshots = useQuery({ queryKey: ['snapshots', portfolio.data?.id], queryFn: () => getSnapshots(portfolio.data!.id), enabled: Boolean(portfolio.data) })
  if (portfolio.isPending || snapshots.isPending) return <LoadingState>Loading recorded snapshots…</LoadingState>
  if (portfolio.isError || snapshots.isError) return <ErrorState onRetry={() => { void portfolio.refetch(); void snapshots.refetch() }} />
  const rows: Snapshot[] = snapshots.data ?? []
  return <section><header className="page-header"><div><h1>Snapshots, as recorded.</h1><p>Immutable portfolio facts captured at an XNYS session boundary.</p></div></header>{rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Session</th><th>Source</th><th>Investments</th><th>Net worth</th><th>Captured</th></tr></thead><tbody>{rows.map((snapshot) => <tr key={snapshot.id}><td>{sessionLabel(snapshot)}</td><td>{snapshot.source}</td><td>{formatUsd(snapshot.investment_value)}</td><td>{formatUsd(snapshot.total_net_worth)}</td><td>Captured from current quote after close · {new Date(snapshot.created_at).toISOString()}</td></tr>)}</tbody></table></div> : <EmptyState>No snapshots are recorded yet. Save the latest completed XNYS session from Holdings.</EmptyState>}</section>
}
