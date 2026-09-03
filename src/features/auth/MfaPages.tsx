import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import type { Factor } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { totpCodeInputSchema, validationErrorMessage } from '@/lib/validation'
import { supabase } from '@/lib/supabase'
import { useSession } from './session'
import { RecoveryExportSection } from '@/features/export/RecoveryExportSection'

type Enrollment = { factorId: string; qrCode: string; secret: string }

const genericError = 'We couldn’t complete that security action. Please try again.'

function verifiedFactors(factors: Factor[]) {
  return factors.filter((factor) => factor.status === 'verified' && factor.factor_type === 'totp')
}

/** Prevents financial routes from mounting while Supabase requires AAL2. */
export function MfaGuard() {
  const session = useSession()
  const [requiresChallenge, setRequiresChallenge] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    if (!session) { setRequiresChallenge(undefined); return }
    let active = true
    async function assess() {
      let { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error) {
        const refreshed = await supabase.auth.refreshSession()
        if (!refreshed.error) ({ data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel())
      }
      // A stale assurance claim must never mount financial routes; challenge will
      // list factors and direct an unconfigured account to enrollment instead.
      if (active) setRequiresChallenge(error ? true : data?.currentLevel === 'aal1' && data.nextLevel === 'aal2')
    }
    void assess()
    return () => { active = false }
  }, [session])
  if (requiresChallenge === undefined) return <main className="auth-shell"><p className="status-copy">Loading your secure workspace…</p></main>
  return requiresChallenge ? <Navigate to="/auth/mfa" replace /> : <Outlet />
}

export function GlobalSignOutButton() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return <button className="button-text" type="button" onClick={() => { queryClient.clear(); navigate('/auth?signout=confirm') }}>Sign out</button>
}

function CodeForm({ factorId, submitLabel, onVerified }: { factorId: string; submitLabel: string; onVerified: () => Promise<void> }) {
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const parsed = totpCodeInputSchema.safeParse({ code })
    if (!parsed.success) { setError(validationErrorMessage('totpCode', parsed.error)); return }
    setBusy(true)
    const challenge = challengeId ? { data: { id: challengeId }, error: null } : await supabase.auth.mfa.challenge({ factorId })
    if (challenge.error || !challenge.data) { setBusy(false); setError(genericError); return }
    setChallengeId(challenge.data.id)
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: parsed.data.code })
    setBusy(false)
    if (verifyError) { setError('That code did not work. Check your authenticator and try again.'); return }
    setChallengeId(null)
    await onVerified()
  }

  return <form className="auth-form mfa-code-form" onSubmit={submit} noValidate>
    <label htmlFor={`totp-${factorId}`}>Authenticator code
      <input ref={inputRef} id={`totp-${factorId}`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />
    </label>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Verifying…' : submitLabel}</button>
  </form>
}

export function MfaChallengePage() {
  const session = useSession()
  const navigate = useNavigate()
  const [factors, setFactors] = useState<Factor[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    void supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (listError) setError(genericError)
      else setFactors(verifiedFactors(data?.all ?? []))
    })
  }, [session])

  if (session === undefined) return <main className="auth-shell"><p className="status-copy">Checking your security requirements…</p></main>
  if (!session) return <Navigate to="/auth" replace />
  if (factors === null && !error) return <main className="auth-shell"><p className="status-copy">Preparing your authenticator challenge…</p></main>
  if (error) return <main className="auth-shell"><section className="auth-panel"><h1>Security check unavailable</h1><p className="auth-intro" role="alert">{error}</p><button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button></section></main>
  if (!factors?.length) return <Navigate to="/security" replace />

  return <main className="auth-shell"><section className="auth-panel" aria-labelledby="mfa-challenge-title">
    <div className="brand-mark" aria-hidden="true"><KeyRound size={22} /></div>
    <h1 id="mfa-challenge-title">Confirm it’s you</h1>
    <p className="auth-intro">Enter a code from one of your authenticator apps to open your private workspace.</p>
    <CodeForm factorId={factors[0]!.id} submitLabel="Verify and continue" onVerified={async () => { navigate('/holdings', { replace: true }) }} />
    <button className="button-text" type="button" onClick={() => navigate('/auth', { replace: true })}>Return to sign in</button>
  </section></main>
}

export function SecurityPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [factors, setFactors] = useState<Factor[]>([])
  const [level, setLevel] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const enrollmentRef = useRef<Enrollment | null>(null)
  const [removalTarget, setRemovalTarget] = useState<Factor | null>(null)
  const [removalVerified, setRemovalVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearEnrollment = () => { enrollmentRef.current = null; setEnrollment(null) }
  const reload = async () => {
    const [{ data: factorData, error: factorError }, { data: levelData, error: levelError }] = await Promise.all([
      supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    if (factorError || levelError) { setError(genericError); return }
    setFactors(verifiedFactors(factorData?.all ?? []))
    setLevel(levelData.currentLevel)
  }

  useEffect(() => { if (session) void reload() }, [session])
  useEffect(() => () => {
    const active = enrollmentRef.current
    clearEnrollment()
    if (active) void supabase.auth.mfa.unenroll({ factorId: active.factorId })
  }, [])

  async function cancelEnrollment() {
    const active = enrollmentRef.current
    clearEnrollment()
    if (active) await supabase.auth.mfa.unenroll({ factorId: active.factorId })
  }

  async function beginEnrollment() {
    setBusy(true); setError(null)
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${factors.length + 1}` })
    setBusy(false)
    if (enrollError || !data?.totp) { setError(genericError); return }
    const next = { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
    enrollmentRef.current = next
    setEnrollment(next)
  }

  async function removeFactor() {
    if (!removalTarget || !removalVerified) return
    setBusy(true); setError(null)
    const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: removalTarget.id })
    setBusy(false)
    if (removeError) { setError(genericError); return }
    setRemovalTarget(null); setRemovalVerified(false)
    await reload()
  }

  if (session === undefined) return <main className="auth-shell"><p className="status-copy">Loading security settings…</p></main>
  if (!session) return <Navigate to="/auth" replace />

  return <section className="security-page" aria-labelledby="security-title">
    <header className="page-header"><div><h1 id="security-title">Security</h1><p>Manage the authenticator apps that protect your private workspace.</p></div><span className="security-level">Session: {level ?? 'checking'}</span></header>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <section className="security-section" aria-labelledby="factors-title">
      <div className="security-section-heading"><div><h2 id="factors-title">Authenticator apps</h2><p>{factors.length ? `${factors.length} verified ${factors.length === 1 ? 'factor' : 'factors'}.` : 'No verified authenticator apps yet.'}</p></div>{!enrollment && <button className="button button-primary" type="button" onClick={() => void beginEnrollment()} disabled={busy}><Plus size={17} />{factors.length ? 'Add recovery factor' : 'Set up authenticator'}</button>}</div>
      {factors.map((factor, index) => <div className="factor-row" key={factor.id}><div><strong>Authenticator {index + 1}</strong><p>Verified TOTP factor</p></div><button className="button button-secondary" type="button" onClick={() => { setRemovalTarget(factor); setRemovalVerified(false) }}><Trash2 size={16} />Remove</button></div>)}
      {!factors.length && !enrollment && <p className="security-note">Set up an authenticator before you rely on this workspace for sensitive financial information.</p>}
    </section>
    {enrollment && <section className="security-section enrollment-panel" aria-labelledby="enrollment-title">
      <h2 id="enrollment-title">Set up your authenticator</h2><p>Scan this QR code with an authenticator app. The setup value is shown only while this page remains open.</p>
      <img className="totp-qr" src={enrollment.qrCode} alt="QR code for authenticator setup" />
      <label className="manual-secret" htmlFor="manual-setup-value">Or enter this setup value manually<input id="manual-setup-value" readOnly value={enrollment.secret} /></label>
      <CodeForm factorId={enrollment.factorId} submitLabel="Verify authenticator" onVerified={async () => { clearEnrollment(); await reload() }} />
      <button className="button-text" type="button" onClick={() => void cancelEnrollment()}>Cancel setup</button>
      {factors.length > 0 && <p className="security-note">Keep this recovery factor in a separate app or device. Supabase does not provide recovery codes; if every factor is lost, this application cannot restore access.</p>}
    </section>}
    {removalTarget && <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="remove-factor-title">
      <h2 id="remove-factor-title">Remove authenticator?</h2>
      <p className="confirmation-copy">You must complete a fresh authenticator challenge before removing a factor.</p>
      {factors.length === 1 && <p className="confirmation-copy"><strong>This is your final verified factor.</strong> Removing it lowers protection and allows future password sessions to use AAL1.</p>}
      {!removalVerified ? <CodeForm factorId={removalTarget.id} submitLabel="Verify removal" onVerified={async () => setRemovalVerified(true)} /> : <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => { setRemovalTarget(null); setRemovalVerified(false) }}>Keep factor</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void removeFactor()}>{busy ? 'Removing…' : 'Remove factor'}</button></div>}
      {!removalVerified && <button className="button-text" type="button" onClick={() => { setRemovalTarget(null); setRemovalVerified(false) }}>Cancel</button>}
    </section></div>}
    <RecoveryExportSection />
    <section className="security-section security-signout"><h2>Sessions</h2><p>Signing out everywhere removes this account from all current devices.</p><button className="button button-secondary" type="button" onClick={() => navigate('/auth?signout=confirm')}>Sign out of all sessions</button></section>
  </section>
}
