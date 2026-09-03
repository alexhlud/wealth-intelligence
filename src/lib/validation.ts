import { z } from 'zod'

const positiveDecimal = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/, 'Enter a decimal number.')
  .refine((value) => value !== '0' && !/^0\.0+$/.test(value), 'Must be greater than zero.')

const nonnegativeDecimal = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/, 'Enter a decimal number.')

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

export const positionIntentSchema = z.object({
  accountId: z.string().uuid('Choose an account.'),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,9}$/, 'Use a valid ticker symbol.'),
  securityName: z.string().trim().min(1, 'Enter a security name.').max(120),
  assetType: z.enum(['stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'cash_equivalent', 'other']),
  quantity: positiveDecimal,
  averageCost: nonnegativeDecimal,
  occurredAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(500).nullable().transform((value) => value || null),
})
export type PositionIntent = z.infer<typeof positionIntentSchema>

const itemBaseSchema = z.object({
  accountId: z.string().uuid().nullable(),
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  value: nonnegativeDecimal,
  includeInNetWorth: z.boolean(),
  notes: z.string().trim().max(500).nullable().transform((value) => value || null),
  asOf: z.string().datetime({ offset: true }),
})
export const manualAssetInputSchema = itemBaseSchema.extend({ category: z.enum(['cash', 'savings', 'real_estate', 'vehicle', 'business_equity', 'collectible', 'other']) })
export const liabilityInputSchema = itemBaseSchema.extend({ category: z.enum(['mortgage', 'vehicle_loan', 'student_loan', 'credit_balance', 'personal_loan', 'other']) })
export type ManualAssetInput = z.infer<typeof manualAssetInputSchema>
export type LiabilityInput = z.infer<typeof liabilityInputSchema>

const itemResponseBaseSchema = z.object({
  id: z.string().uuid(), portfolio_id: z.string().uuid(), account_id: z.string().uuid().nullable(), name: z.string().trim().min(1).max(120),
  current_value: postgrestDecimal.optional(), outstanding_balance: postgrestDecimal.optional(), currency_code: z.literal('USD'), include_in_net_worth: z.boolean(), notes: nullableText(500), value_as_of: z.string().datetime({ offset: true }).optional(), balance_as_of: z.string().datetime({ offset: true }).optional(),
})
export const manualAssetResponseSchema = z.array(itemResponseBaseSchema.extend({ category: z.enum(['cash', 'savings', 'real_estate', 'vehicle', 'business_equity', 'collectible', 'other']), current_value: postgrestDecimal, value_as_of: z.string().datetime({ offset: true }) }))
export const liabilityResponseSchema = z.array(itemResponseBaseSchema.extend({ category: z.enum(['mortgage', 'vehicle_loan', 'student_loan', 'credit_balance', 'personal_loan', 'other']), outstanding_balance: postgrestDecimal, balance_as_of: z.string().datetime({ offset: true }) }))
export type ManualAssetResponse = z.infer<typeof manualAssetResponseSchema>[number]
export type LiabilityResponse = z.infer<typeof liabilityResponseSchema>[number]

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter an account name.').max(80),
  institutionName: z.string().trim().max(120).nullable().transform((value) => value || null),
  accountType: accountTypeSchema,
  includeInNetWorth: z.boolean(),
})
export type AccountInput = z.infer<typeof accountInputSchema>

const passwordSchema = z.string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use 128 characters or fewer.')

export const signInInputSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: passwordSchema,
})

export const passwordResetInputSchema = z.object({ email: z.string().trim().email('Enter a valid email address.') })

export const invitationPasswordInputSchema = z.object({
  password: passwordSchema,
})

/** TOTP codes are short-lived numeric values supplied by an authenticator. */
export const totpCodeInputSchema = z.object({
  code: z.string().trim().regex(/^\d{6,8}$/, 'Enter the code from your authenticator app.'),
})

type FormName = 'account' | 'invitationPassword' | 'passwordReset' | 'signIn' | 'totpCode'

/** Keeps client validation copy authored rather than exposing Zod implementation messages. */
export function validationErrorMessage(form: FormName, error: z.ZodError): string {
  const field = String(error.issues[0]?.path[0] ?? '')
  if (form === 'account') {
    if (field === 'name') return 'Enter an account name.'
    if (field === 'institutionName') return 'Enter an institution of 120 characters or fewer.'
    if (field === 'accountType') return 'Choose an account type.'
    return 'Check the account details and try again.'
  }
  if (form === 'invitationPassword' && field === 'password') return error.issues[0]?.message ?? 'Check the password and try again.'
  if (form === 'passwordReset') return 'Enter a valid email address.'
  if (form === 'totpCode') return 'Enter the code from your authenticator app.'
  if (field === 'email') return 'Enter a valid email address.'
  if (field === 'password') return error.issues[0]?.message ?? 'Check the password and try again.'
  return 'Check the details and try again.'
}
