import { z } from 'zod'

const positiveDecimal = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/, 'Enter a decimal number.')
  .refine((value) => value !== '0' && !/^0\.0+$/.test(value), 'Must be greater than zero.')

const postgrestDecimal = z
  .union([
    positiveDecimal,
    z.number()
      .finite('Expected a finite decimal number.')
      .refine((value) => Math.abs(value) <= Number.MAX_SAFE_INTEGER, 'Expected a safe decimal number.')
      .transform((value) => value.toString()),
  ])
  .pipe(positiveDecimal)

export const positionInputSchema = z.object({
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9.-]{0,9}$/, 'Use a valid ticker symbol.'),
  quantity: positiveDecimal,
  averageCost: positiveDecimal,
})

export type PositionInput = z.infer<typeof positionInputSchema>

const positionResponseRowSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/),
  quantity: postgrestDecimal,
  average_cost: postgrestDecimal,
})

export const positionResponseSchema = z.array(positionResponseRowSchema)

export type PositionResponse = z.infer<typeof positionResponseRowSchema>

/** Normalizes untrusted PostgREST numeric JSON to canonical decimal strings. */
export function parsePositionResponse(value: unknown): PositionResponse[] {
  return positionResponseSchema.parse(value)
}

export const signInInputSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
})
