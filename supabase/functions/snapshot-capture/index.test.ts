import { describe, expect, it } from 'vitest'
import {
  response,
  responseForCaptureSession,
} from './response.ts'

describe('snapshot capture responses', () => {
  it('returns bodyless responses for null-body statuses', () => {
    expect(() => response(204)).not.toThrow()

    for (const status of [204, 205, 304]) {
      const result = response(status)

      expect(result.status).toBe(status)
      expect(result.body).toBeNull()
    }
  })

  it('returns 204 without a body when there is no completed session', () => {
    const result = responseForCaptureSession({ kind: 'non_session' })

    expect(result?.status).toBe(204)
    expect(result?.body).toBeNull()
  })
})
