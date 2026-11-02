import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { accountResponseSchema, liabilityResponseSchema, manualAssetResponseSchema } from '@/lib/validation'
import { supabase } from '@/lib/supabase'

const decimal = z.string().trim().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/)
export const historicalValueItemSchema = z.object({ name: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(40), account_label: z.string().trim().max(80).nullable(), value: decimal, include_in_net_worth: z.boolean() })
export type HistoricalValueItem = z.infer<typeof historicalValueItemSchema>
export const emptyHistoricalValueItem = (): HistoricalValueItem => ({ name: '', category: 'other', account_label: null, value: '', include_in_net_worth: true })

const recordedSuggestionSchema = z.object({ name: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(40), account_label: z.string().trim().max(80).nullable() })
export type RecordedValueItemSuggestion = z.infer<typeof recordedSuggestionSchema>

function uniqueSuggestions(items: RecordedValueItemSuggestion[]) {
  return [...new Map(items.map((item) => [`${item.name}\u0000${item.category}\u0000${item.account_label ?? ''}`, item])).values()]
    .sort((left, right) => left.name.localeCompare(right.name) || left.category.localeCompare(right.category) || (left.account_label ?? '').localeCompare(right.account_label ?? ''))
}

async function loadRecordedSuggestions(portfolioId: string) {
  const [assets, liabilities] = await Promise.all([
    supabase.from('snapshot_manual_assets').select('name, category, account_label').eq('portfolio_id', portfolioId),
    supabase.from('snapshot_liabilities').select('name, category, account_label').eq('portfolio_id', portfolioId),
  ])
  if (assets.error || liabilities.error) throw new Error('Recorded value item suggestions unavailable')
  return {
    assets: uniqueSuggestions(z.array(recordedSuggestionSchema).parse(assets.data)),
    liabilities: uniqueSuggestions(z.array(recordedSuggestionSchema).parse(liabilities.data)),
  }
}

export function useRecordedValueItemSuggestions(portfolioId: string, enabled = true) {
  return useQuery({ queryKey: ['recorded-value-item-suggestions', portfolioId], queryFn: () => loadRecordedSuggestions(portfolioId), enabled })
}

export function RecordedValueItemSuggestionSelect({ kind, suggestions, onChoose }: { kind: 'asset' | 'liability'; suggestions: RecordedValueItemSuggestion[]; onChoose: (suggestion: RecordedValueItemSuggestion) => void }) {
  if (suggestions.length === 0) return null
  const label = kind === 'asset' ? 'asset' : 'liability'
  return <label>Use recorded {label} <span>(optional)</span><select value="" onChange={(event) => { const suggestion = suggestions[Number(event.target.value)]; if (suggestion) onChoose(suggestion) }}><option value="">Choose a recorded {label}</option>{suggestions.map((suggestion, index) => <option key={`${suggestion.name}-${suggestion.category}-${suggestion.account_label ?? ''}`} value={index}>{suggestion.name} · {suggestion.category.replaceAll('_', ' ')}{suggestion.account_label ? ` · ${suggestion.account_label}` : ''}</option>)}</select></label>
}

async function load(portfolioId: string) {
  const [accounts, assets, liabilities] = await Promise.all([
    supabase.from('accounts').select('id, portfolio_id, name, institution_name, account_type, include_in_net_worth, currency_code').eq('portfolio_id', portfolioId).order('created_at'),
    supabase.from('manual_assets').select('*').eq('portfolio_id', portfolioId).order('created_at'),
    supabase.from('liabilities').select('*').eq('portfolio_id', portfolioId).order('created_at'),
  ])
  if (accounts.error || assets.error || liabilities.error) throw new Error('Current value items unavailable')
  const names = new Map(accountResponseSchema.parse(accounts.data).map((account) => [account.id, account.name]))
  return {
    assets: manualAssetResponseSchema.parse(assets.data).map((item) => ({ name: item.name, category: item.category, account_label: item.account_id ? names.get(item.account_id) ?? null : null, value: item.current_value, include_in_net_worth: item.include_in_net_worth })),
    liabilities: liabilityResponseSchema.parse(liabilities.data).map((item) => ({ name: item.name, category: item.category, account_label: item.account_id ? names.get(item.account_id) ?? null : null, value: item.outstanding_balance, include_in_net_worth: item.include_in_net_worth })),
  }
}

function Rows({ kind, rows, setRows, suggestions }: { kind: 'asset' | 'liability'; rows: HistoricalValueItem[]; setRows: (rows: HistoricalValueItem[]) => void; suggestions: RecordedValueItemSuggestion[] }) {
  const label = kind === 'asset' ? 'Manual assets' : 'Liabilities'
  return <section className="snapshot-value-items"><h3>{label}</h3><p className="snapshot-note">These are user-supplied historical values for the selected date, not current records. Review each prefilled row and remove any that did not exist then.</p>{rows.map((row, index) => <div className="snapshot-row" key={`${kind}-${index}`}><RecordedValueItemSuggestionSelect kind={kind} suggestions={suggestions} onChoose={(suggestion) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, ...suggestion } : item))} /><label>Name<input value={row.name} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label><label>Category<input value={row.category} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item))} /></label><label>Account label <span>(optional)</span><input value={row.account_label ?? ''} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, account_label: event.target.value || null } : item))} /></label><label>{kind === 'asset' ? 'Value' : 'Balance'}<input inputMode="decimal" value={row.value} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /></label><label className="checkbox-row"><input type="checkbox" checked={row.include_in_net_worth} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, include_in_net_worth: event.target.checked } : item))} /> Include in net worth</label><Button type="button" className="button-text" onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></div>)}<p className="snapshot-note">Choosing a recorded item copies its name, category, and account label only. It does not link items.</p><Button type="button" className="button-secondary" onClick={() => setRows([...rows, emptyHistoricalValueItem()])}>Add {kind === 'asset' ? 'manual asset' : 'liability'}</Button></section>
}

export function HistoricalValueItems({ portfolioId, enabled, onChange }: { portfolioId: string; enabled: boolean; onChange: (assets: HistoricalValueItem[], liabilities: HistoricalValueItem[]) => void }) {
  const current = useQuery({ queryKey: ['historical-value-items', portfolioId], queryFn: () => load(portfolioId), enabled })
  const suggestions = useRecordedValueItemSuggestions(portfolioId, enabled)
  const [assets, setAssets] = useState<HistoricalValueItem[]>([]); const [liabilities, setLiabilities] = useState<HistoricalValueItem[]>([]); const [loaded, setLoaded] = useState(false)
  useEffect(() => { if (current.data && !loaded) { setAssets(current.data.assets); setLiabilities(current.data.liabilities); setLoaded(true) } }, [current.data, loaded])
  useEffect(() => { onChange(assets, liabilities) }, [assets, liabilities, onChange])
  if (current.isPending) return <p className="refetch-copy" role="status">Loading current value items as editable starting points...</p>
  if (current.isError) return <p className="form-error" role="alert">We could not load current assets and liabilities. Add the historical values manually.</p>
  return <><Rows kind="asset" rows={assets} setRows={setAssets} suggestions={suggestions.data?.assets ?? []} /><Rows kind="liability" rows={liabilities} setRows={setLiabilities} suggestions={suggestions.data?.liabilities ?? []} /></>
}
