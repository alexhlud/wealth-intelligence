import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseProjectionBaselineResponse } from './data'

const rpcResponse = [{
  id: '33333333-3333-4333-8333-333333333333',
  as_of_date: '2026-09-30',
  market_close_at: '2026-09-30T20:00:00.000Z',
  investment_value: '520000.00000000',
  manual_asset_value: '2451.80000000',
  liability_value: '0.00000000',
  total_net_worth: '522451.80000000',
}]

describe('parseProjectionBaselineResponse', () => {
  afterEach(() => vi.restoreAllMocks())

  it('parses the exact recorded projection-baseline RPC response shape', () => {
    expect(parseProjectionBaselineResponse(rpcResponse)).toEqual(rpcResponse[0])
  })

  it('rejects numeric JSON money and logs only a sanitized issue in development', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => parseProjectionBaselineResponse([{ ...rpcResponse[0], investment_value: 520000 }])).toThrow('Projection baseline is unavailable')
    expect(consoleError).toHaveBeenCalledWith('Projection baseline contract validation failed.', {
      issues: [{ path: '0.investment_value', code: 'invalid_type', rule: 'Invalid input: expected string, received number' }],
    })
  })
})
