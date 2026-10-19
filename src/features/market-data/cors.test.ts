import { describe, expect, it } from 'vitest'
import { corsHeaders, corsPreflight, parseAllowedOrigins } from '../../../supabase/functions/market-data/cors'

function preflight(origin: string, allowedOrigins = parseAllowedOrigins(undefined)) {
  return corsPreflight(new Request('https://example.test/market-data', { method: 'OPTIONS', headers: { origin } }), allowedOrigins)
}

describe('market-data CORS', () => {
  it.each([
    'http://localhost:5173',
    'https://wealth-intelligence.pages.dev',
    'https://motionofwealth.com',
    'https://www.motionofwealth.com',
  ])('allows preflight and response headers for %s by default', (origin) => {
    const response = preflight(origin)
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS')
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization, apikey, content-type, x-client-info')
    expect(response.headers.get('vary')).toBe('Origin')
    expect(new Headers(corsHeaders(new Request('https://example.test', { headers: { origin } }), parseAllowedOrigins(undefined))).get('access-control-allow-origin')).toBe(origin)
  })

  it('does not give a disallowed origin access-control permission', () => {
    const response = preflight('https://evil.example')
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-headers')).toBeNull()
    expect(response.headers.get('access-control-allow-methods')).toBeNull()
    expect(response.headers.get('vary')).toBe('Origin')
  })

  it('uses the configured exact origins in place of the defaults', () => {
    const origins = parseAllowedOrigins(' https://new.example, http://localhost:5173 , ,* ')
    expect(origins).toEqual(['https://new.example', 'http://localhost:5173'])
    expect(preflight('https://new.example', origins).headers.get('access-control-allow-origin')).toBe('https://new.example')
    expect(preflight('https://motionofwealth.com', origins).headers.get('access-control-allow-origin')).toBeNull()
    expect(preflight('https://other.example', origins).headers.get('access-control-allow-origin')).toBeNull()
    expect(preflight('*', origins).headers.get('access-control-allow-origin')).toBeNull()
    expect(parseAllowedOrigins('')).toEqual([])
  })
})
