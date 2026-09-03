import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (widgetId?: string) => void; remove: (widgetId: string) => void }
  }
}

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
let loader: Promise<void> | undefined

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve()
  if (!loader) loader = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Turnstile unavailable'))
    document.head.append(script)
  })
  return loader
}

/** Renders the Supabase-supported CAPTCHA and keeps its short-lived proof out of application state. */
export function Turnstile({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const elementRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!siteKey || !elementRef.current) return
    let active = true
    void loadTurnstile().then(() => {
      if (!active || !elementRef.current || !window.turnstile) return
      widgetRef.current = window.turnstile.render(elementRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      })
    }).catch(() => onTokenRef.current(null))
    return () => { active = false; if (widgetRef.current) window.turnstile?.remove(widgetRef.current) }
  }, [])

  useEffect(() => { if (widgetRef.current) window.turnstile?.reset(widgetRef.current) }, [resetKey])

  if (!siteKey) return <p className="form-message error" role="alert">Security verification is unavailable. Please try again later.</p>
  return <div className="turnstile-widget" ref={elementRef} aria-label="Security verification" />
}
