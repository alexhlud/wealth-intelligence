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

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable()

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

const portfolioResponseRowSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80) })
export const portfolioResponseSchema = z.array(portfolioResponseRowSchema)
export type PortfolioResponse = z.infer<typeof portfolioResponseRowSchema>

const accountTypeSchema = z.enum(['brokerage', 'retirement', 'savings', 'cash', 'crypto_wallet', 'other'])
const accountResponseRowSchema = z.object({
  id: z.string().uuid(), portfolio_id: z.string().uuid(), name: z.string().trim().min(1).max(80),
  institution_name: nullableText(120), account_type: accountTypeSchema, include_in_net_worth: z.boolean(),
})
export const accountResponseSchema = z.array(accountResponseRowSchema)
export type AccountResponse = z.infer<typeof accountResponseRowSchema>

const openPositionResponseRowSchema = z.object({
  id: z.string().uuid(), account_id: z.string().uuid(), symbol: z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/),
  security_name: z.string().trim().min(1).max(120), asset_type: z.enum(['stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'cash_equivalent', 'other']),
  status: z.literal('open'), quantity: postgrestDecimal, average_cost: postgrestDecimal,
})
export const openPositionResponseSchema = z.array(openPositionResponseRowSchema)
export type OpenPositionResponse = z.infer<typeof openPositionResponseRowSchema>

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter an account name.').max(80),
  institutionName: z.string().trim().max(120).transform((value) => value || null),
  accountType: accountTypeSchema,
  includeInNetWorth: z.boolean(),
})
export type AccountInput = z.infer<typeof accountInputSchema>

export const signInInputSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
})
