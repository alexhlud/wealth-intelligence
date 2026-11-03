type ZodIssueLike = { path: readonly PropertyKey[]; code: string; message: string }

export type SanitizedZodContractIssue = {
  path: string
  code: string
  rule: string
}

/** Omits response values so development diagnostics cannot disclose financial data. */
export function sanitizedZodContractIssues(issues: readonly ZodIssueLike[]): SanitizedZodContractIssue[] {
  return issues.map((issue) => ({ path: issue.path.map(String).join('.') || '(root)', code: issue.code, rule: issue.message }))
}

export function logZodContractDiagnostic(label: string, issues: readonly SanitizedZodContractIssue[]) {
  if (import.meta.env.DEV) console.error(`${label} contract validation failed.`, { issues })
}
