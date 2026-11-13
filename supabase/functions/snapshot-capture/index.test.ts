import { describe, expect, it } from 'vitest'
import {
  response,
  responseForCaptureSession,
  responseForCaptureResults,
} from './response.ts'
import {
  expectedPortfoliosAreSatisfied,
  shouldLoadNextPortfolioPage,
} from './health.ts'

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

  it('returns a failure when every processed portfolio records a gap', () => {
    expect(responseForCaptureResults(0, 0).status).toBe(503)
    expect(responseForCaptureResults(2, 2).status).toBe(503)
    expect(responseForCaptureResults(2, 1).status).toBe(200)
    expect(responseForCaptureResults(2, 0).status).toBe(200)
  })

  it('excludes empty portfolios and treats a deliberate skip as satisfied', () => {
    expect(expectedPortfoliosAreSatisfied([], [], [])).toBe(true)
    expect(expectedPortfoliosAreSatisfied(['with-content'], [], ['with-content'])).toBe(true)
  })

  it('does not satisfy a content-bearing portfolio without a snapshot or skip', () => {
    expect(expectedPortfoliosAreSatisfied(['with-content'], [], [])).toBe(false)
  })

  it('continues through every full portfolio page', () => {
    const pageSize = 2
    const pages = [['one', 'two'], ['three', 'four'], ['five']]
    const processed = [] as string[]

    for (const page of pages) {
      processed.push(...page)

      if (!shouldLoadNextPortfolioPage(page.length, pageSize)) {
        break
      }
    }

    expect(processed).toEqual(['one', 'two', 'three', 'four', 'five'])
  })
})
