import { z } from 'zod'
import { logZodContractDiagnostic, sanitizedZodContractIssues } from '@/lib/zodContractDiagnostic'

const decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/)

export const projectionBaselineResponseSchema = z.object({
  id: z.string().uuid(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  market_close_at: z.string().min(1),
  investment_value: decimal,
  manual_asset_value: decimal,
  liability_value: decimal,
  total_net_worth: decimal,
})

export const projectionBaselineResponsesSchema = z.array(projectionBaselineResponseSchema)
export type ProjectionBaselineResponse = z.infer<typeof projectionBaselineResponseSchema>

export function parseProjectionBaselineResponse(data: unknown) {
  const parsed = projectionBaselineResponsesSchema.safeParse(data)
  if (!parsed.success) {
    logZodContractDiagnostic('Projection baseline', sanitizedZodContractIssues(parsed.error.issues))
    throw new Error('Projection baseline is unavailable')
  }
  return parsed.data.at(0) ?? null
}
