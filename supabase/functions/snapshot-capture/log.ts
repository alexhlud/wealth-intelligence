/**
 * Logs a worker failure with its error class, code and a redacted message.
 * Numbers are redacted so a financial value can never reach the log.
 */
export function logFailure(operation: string, error: unknown) {
  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {}

  console.error('Snapshot capture worker failure', {
    operation,
    errorClass: error instanceof Error ? error.name : typeof error,
    code: typeof record.code === 'string' ? record.code : undefined,
    message: String(record.message ?? error)
      .replace(/\d+(?:\.\d+)?/g, '[redacted-number]')
      .slice(0, 180),
  })
}
