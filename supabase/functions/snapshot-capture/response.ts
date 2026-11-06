const nullBodyStatuses = new Set([204, 205, 304])

type CaptureSession = {
  kind: 'session' | 'non_session'
}

export function response(status: number) {
  if (nullBodyStatuses.has(status)) {
    return new Response(null, { status })
  }

  return Response.json({ ok: status < 400 }, { status })
}

export function responseForCaptureSession(session: CaptureSession) {
  return session.kind === 'session' ? null : response(204)
}

export function responseForCaptureResults(completedPortfolioCount: number) {
  return response(completedPortfolioCount > 0 ? 200 : 503)
}
