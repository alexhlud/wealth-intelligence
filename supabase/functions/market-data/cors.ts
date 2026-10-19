export const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173,https://wealth-intelligence.pages.dev,https://motionofwealth.com,https://www.motionofwealth.com'

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? DEFAULT_ALLOWED_ORIGINS).split(',').map((origin) => origin.trim()).filter((origin) => origin !== '' && origin !== '*')
}

export function corsHeaders(request: Request, allowedOrigins: string[]): HeadersInit {
  const origin = request.headers.get('origin')
  return origin && allowedOrigins.includes(origin)
    ? { 'access-control-allow-origin': origin, 'vary': 'Origin', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' }
    : { 'vary': 'Origin' }
}

export function corsPreflight(request: Request, allowedOrigins: string[]): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, allowedOrigins) })
}
