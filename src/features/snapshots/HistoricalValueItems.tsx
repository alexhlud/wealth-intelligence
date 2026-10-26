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

function Rows({ kind, rows, setRows }: { kind: 'asset' | 'liability'; rows: HistoricalValueItem[]; setRows: (rows: HistoricalValueItem[]) => void }) {
  const label = kind === 'asset' ? 'Manual assets' : 'Liabilities'
  return <section className="snapshot-value-items"><h3>{label}</h3><p className="snapshot-note">These are user-supplied historical values for the selected date, not current records. Review each prefilled row and remove any that did not exist then.</p>{rows.map((row, index) => <div className="snapshot-row" key={`${kind}-${index}`}><label>Name<input value={row.name} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label><label>Category<input value={row.category} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item))} /></label><label>Account label <span>(optional)</span><input value={row.account_label ?? ''} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, account_label: event.target.value || null } : item))} /></label><label>{kind === 'asset' ? 'Value' : 'Balance'}<input inputMode="decimal" value={row.value} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} /></label><label className="checkbox-row"><input type="checkbox" checked={row.include_in_net_worth} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, include_in_net_worth: event.target.checked } : item))} /> Include in net worth</label><Button type="button" className="button-text" onClick={() => setRows(rows.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></div>)}<Button type="button" className="button-secondary" onClick={() => setRows([...rows, emptyHistoricalValueItem()])}>Add {kind === 'asset' ? 'manual asset' : 'liability'}</Button></section>
}

export function HistoricalValueItems({ portfolioId, enabled, onChange }: { portfolioId: string; enabled: boolean; onChange: (assets: HistoricalValueItem[], liabilities: HistoricalValueItem[]) => void }) {
  const current = useQuery({ queryKey: ['historical-value-items', portfolioId], queryFn: () => load(portfolioId), enabled })
  const [assets, setAssets] = useState<HistoricalValueItem[]>([]); const [liabilities, setLiabilities] = useState<HistoricalValueItem[]>([]); const [loaded, setLoaded] = useState(false)
  useEffect(() => { if (current.data && !loaded) { setAssets(current.data.assets); setLiabilities(current.data.liabilities); setLoaded(true) } }, [current.data, loaded])
  useEffect(() => { onChange(assets, liabilities) }, [assets, liabilities, onChange])
  if (current.isPending) return <p className="refetch-copy" role="status">Loading current value items as editable starting points...</p>
  if (current.isError) return <p className="form-error" role="alert">We could not load current assets and liabilities. Add the historical values manually.</p>
  return <><Rows kind="asset" rows={assets} setRows={setAssets} /><Rows kind="liability" rows={liabilities} setRows={setLiabilities} /></>
}
