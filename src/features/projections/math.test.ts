import { describe, expect, it } from 'vitest'
import { project } from './math'

describe('composition-aware projection never blends net worth', () => {
  it('keeps a $23K investment and $500K real-value asset distinct over 30 years', () => {
    const points = project({ investments: '23000', assets: '500000', liabilities: '2000', yearMonth: '2026-11' }, { investmentRate: '7', assetRate: '2.5', inflationRate: '2.5', years: 30 }, '1000')
    const final = points.at(-1)!
    expect(final.nominal).toMatch(/^2[0-9]{6}\./)
    expect(Number(final.nominal)).toBeLessThan(3000000)
  })
})
