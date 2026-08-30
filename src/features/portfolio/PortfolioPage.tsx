import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Plus, ShieldCheck } from 'lucide-react'
import { SignOutButton } from '@/features/auth/AuthPages'
import { positionInputSchema } from '@/lib/validation'
import { supabase } from '@/lib/supabase'
import { formatUsd, HARDCODED_USD_PRICE_BY_SYMBOL, marketValue, sumDecimals } from './prices'

type Portfolio = { id: string; name: string }
type Position = { id: string; symbol: string; quantity: string; average_cost: string }

async function initializePortfolio(): Promise<Portfolio> {
  const { data, error } = await supabase.rpc('ensure_primary_portfolio')
  if (error || !data) throw error ?? new Error('Could not prepare your portfolio.')
  return data as Portfolio
}

async function getPositions(portfolioId: string): Promise<Position[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('id, symbol, quantity, average_cost')
    .eq('portfolio_id', portfolioId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as Position[]
}

export function PortfolioPage() {
  const queryClient = useQueryClient()
  const [symbol, setSymbol] = useState('QQQ')
  const [quantity, setQuantity] = useState('')
  const [averageCost, setAverageCost] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const portfolioQuery = useQuery({ queryKey: ['primary-portfolio'], queryFn: initializePortfolio })
  const positionsQuery = useQuery({
    queryKey: ['positions', portfolioQuery.data?.id],
    queryFn: () => getPositions(portfolioQuery.data!.id),
    enabled: Boolean(portfolioQuery.data?.id),
  })
  const addPosition = useMutation({
    mutationFn: async () => {
      const parsed = positionInputSchema.safeParse({ symbol, quantity, averageCost })
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the position details.')
      if (!HARDCODED_USD_PRICE_BY_SYMBOL[parsed.data.symbol]) throw new Error('This slice supports QQQ and VOO fixed prices only.')
      const { error } = await supabase.from('positions').insert({
        portfolio_id: portfolioQuery.data!.id,
        symbol: parsed.data.symbol,
        quantity: parsed.data.quantity,
        average_cost: parsed.data.averageCost,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setQuantity('')
      setAverageCost('')
      await queryClient.invalidateQueries({ queryKey: ['positions', portfolioQuery.data?.id] })
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'Could not save the position.'),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    addPosition.mutate()
  }

  if (portfolioQuery.isPending) return <main className="portfolio-shell"><p className="status-copy">Preparing your primary portfolio…</p></main>
  if (portfolioQuery.isError) return <main className="portfolio-shell"><p className="error-state"><CircleAlert size={18} /> We couldn’t prepare your portfolio. Please sign out and try again.</p></main>

  const positions = positionsQuery.data ?? []
  const total = sumDecimals(positions.flatMap((position) => {
    const price = HARDCODED_USD_PRICE_BY_SYMBOL[position.symbol]
    return price ? [marketValue(position.quantity, price)] : []
  }))

  return (
    <main className="portfolio-shell">
      <header className="portfolio-header">
        <div><p className="brand-name">Wealth Intelligence</p><h1>{portfolioQuery.data.name}</h1></div>
        <SignOutButton />
      </header>
      <section className="portfolio-summary" aria-label="Portfolio summary">
        <p>Portfolio value</p><strong>{formatUsd(total)}</strong>
        <span><ShieldCheck size={15} /> Private and protected by row-level security</span>
      </section>
      <div className="portfolio-grid">
        <section className="positions-section" aria-labelledby="positions-heading">
          <div className="section-heading"><h2 id="positions-heading">Positions</h2><p>Fixed illustrative prices: QQQ $500.00 · VOO $600.00</p></div>
          {positionsQuery.isPending && <p className="status-copy">Loading positions…</p>}
          {positionsQuery.isError && <p className="error-state"><CircleAlert size={18} /> Your positions could not be loaded.</p>}
          {!positionsQuery.isPending && !positionsQuery.isError && positions.length === 0 && <p className="empty-state">Your wealth timeline starts here. Add your first investment.</p>}
          {positions.map((position) => {
            const price = HARDCODED_USD_PRICE_BY_SYMBOL[position.symbol]
            return <article className="position-row" key={position.id}>
              <div><strong>{position.symbol}</strong><span>{position.quantity} shares · avg. cost {formatUsd(position.average_cost)}</span></div>
              <strong>{price ? formatUsd(marketValue(position.quantity, price)) : 'Price unavailable'}</strong>
            </article>
          })}
        </section>
        <section className="add-position" aria-labelledby="add-heading">
          <h2 id="add-heading">Add a position</h2>
          <p>Use the fixed prices in this thin slice.</p>
          <form onSubmit={submit} noValidate>
            <label htmlFor="symbol">Ticker</label><input id="symbol" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} maxLength={10} />
            <label htmlFor="quantity">Shares</label><input id="quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            <label htmlFor="average-cost">Average cost (USD)</label><input id="average-cost" inputMode="decimal" value={averageCost} onChange={(event) => setAverageCost(event.target.value)} />
            {formError && <p className="form-message error" role="alert">{formError}</p>}
            <button className="primary-button" type="submit" disabled={addPosition.isPending}><Plus size={18} />{addPosition.isPending ? 'Saving…' : 'Add position'}</button>
          </form>
        </section>
      </div>
    </main>
  )
}
