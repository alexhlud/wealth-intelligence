export const standardMilestones = ['10000', '25000', '50000', '100000', '250000', '500000', '1000000', '2000000'] as const

export function nextMilestone(value: string) {
  return standardMilestones.find((milestone) => BigInt(milestone) > BigInt(value.split('.')[0] ?? '0')) ?? null
}
