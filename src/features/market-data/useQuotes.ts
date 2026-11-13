import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { canonicalSymbolSchema, quoteSchema } from './contracts'

const requestSchema = z.array(canonicalSymbolSchema).max(25)
const responseSchema = z.object({ quotes: z.array(quoteSchema) })

export async function getQuotes(symbols: readonly string[]) {
  const uniqueSymbols = [...new Set(symbols)].sort()
  const quotes = []
  for (let offset = 0; offset < uniqueSymbols.length; offset += 25) {
    const batch = requestSchema.parse(uniqueSymbols.slice(offset, offset + 25))
    const { data, error } = await supabase.functions.invoke('market-data', { body: { operation: 'quotes', symbols: batch } })
    if (error) throw new Error('Quotes unavailable')
    const parsed = responseSchema.parse(data).quotes
    if (parsed.length !== batch.length || new Set(parsed.map((quote) => quote.symbol)).size !== batch.length || parsed.some((quote) => !batch.includes(quote.symbol))) throw new Error('Invalid quotes')
    if (parsed.some((quote) => quote.freshness === 'unavailable' ? quote.price !== null : quote.price === null || quote.lastSuccessfulAt === null)) throw new Error('Invalid quote state')
    quotes.push(...parsed)
  }
  return quotes
}

export function useQuotes(portfolioId: string | undefined, symbols: readonly string[]) {
  const uniqueSymbols = [...new Set(symbols)].sort()
  return useQuery({
    queryKey: ['quotes', portfolioId, uniqueSymbols],
    queryFn: () => getQuotes(uniqueSymbols),
    enabled: Boolean(portfolioId && uniqueSymbols.length),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
}
