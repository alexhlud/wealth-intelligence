import { z } from 'zod'

const positiveDecimal = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/, 'Enter a decimal number.')
  .refine((value) => value !== '0' && !/^0\.0+$/.test(value), 'Must be greater than zero.')

export const positionInputSchema = z.object({
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9.\-]{0,9}$/, 'Use a valid ticker symbol.'),
  quantity: positiveDecimal,
  averageCost: positiveDecimal,
})

export type PositionInput = z.infer<typeof positionInputSchema>

export const signInInputSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
})
