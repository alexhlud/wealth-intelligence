import { describe, expect, it } from 'vitest'
import { createRecoveryExport } from './recoveryExport'

const id = '11111111-1111-4111-8111-111111111111'

function clientFor(rows: unknown[]) {
  return {
    from: () => ({ select: () => ({ order: () => ({ range: () => Promise.resolve({ data: rows, error: null }) }) }) }),
  }
}

describe('recovery export', () => {
  it('includes every current and immutable collection and serializes NUMERIC values as strings', async () => {
    const result = await createRecoveryExport(clientFor([{ id, quantity: 20.5, average_cost: 400 }]) as never)
    expect(result.export_version).toBe(1)
    expect(Object.keys(result.collections)).toHaveLength(11)
    expect(result.collections.positions[0]).toMatchObject({ quantity: '20.5', average_cost: '400' })
  })

  it('rejects untrusted or incomplete responses instead of creating a partial export', async () => {
    await expect(createRecoveryExport(clientFor([{ id: 'not-a-uuid' }]) as never)).rejects.toThrow('could not be verified')
    await expect(createRecoveryExport({ from: () => ({ select: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: new Error('failed') }) }) }) }) } as never)).rejects.toThrow('could not be completed')
  })
})
