import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogIn, UserPlus } from 'lucide-react'
import { invitationPasswordInputSchema, passwordResetInputSchema, signInInputSchema, validationErrorMessage } from '@/lib/validation'
import { supabase } from '@/lib/supabase'
import { useSession } from './session'
import { Turnstile } from './Turnstile'
import { MfaCodeForm } from './MfaPages'

const genericAuthError = 'We couldn’t complete that request. Please check your details and try again.'
const resetNotice = 'If an account matches that email address, a recovery link is on its way.'
const pendingRecoveryKey = 'wealth-intelligence.auth.recovery-pending'

export function hasPendingRecovery() {
  return window.sessionStorage.getItem(pendingRecoveryKey) === 'true'
}

function markPendingRecovery() {
  window.sessionStorage.setItem(pendingRecoveryKey, 'true')
}

function clearPendingRecovery() {
  window.sessionStorage.removeItem(pendingRecoveryKey)
}

export function AuthPage() {
  const session = useSession(); const [searchParams, setSearchParams] = useSearchParams(); const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>(() => searchParams.get('mode') === 'reset' ? 'reset' : 'sign-in'); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [isSubmitting, setIsSubmitting] = useState(false); const [captchaToken, setCaptchaToken] = useState<string | null>(null); const [captchaReset, setCaptchaReset] = useState(0)
  if (session && searchParams.get('signout') !== 'confirm') return <Navigate to={hasPendingRecovery() ? '/auth/callback?flow=recovery' : '/'} replace />
  const resetCaptcha = () => { setCaptchaToken(null); setCaptchaReset((value) => value + 1) }
  const changeMode = (next: 'sign-in' | 'sign-up' | 'reset') => { setMode(next); setError(null); setNotice(null); resetCaptcha() }
  async function signOutEverywhere() { setIsSubmitting(true); await supabase.auth.signOut({ scope: 'global' }); setIsSubmitting(false); setSearchParams({}, { replace: true }) }
  if (searchParams.get('signout') === 'confirm') return <main className="auth-shell"><section className="auth-panel" aria-labelledby="signout-title"><h1 id="signout-title">Sign out everywhere?</h1><p className="auth-intro">This will sign this account out on every device. You’ll need your password and, where configured, an authenticator code to return.</p><div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => setSearchParams({}, { replace: true })}>Cancel</button><button className="button button-primary" type="button" disabled={isSubmitting} onClick={() => void signOutEverywhere()}>{isSubmitting ? 'Signing out…' : 'Sign out everywhere'}</button></div></section></main>
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setNotice(null)
    const parsed = (mode === 'reset' ? passwordResetInputSchema : signInInputSchema).safeParse({ email, password })
    if (!parsed.success) { setError(validationErrorMessage(mode === 'reset' ? 'passwordReset' : 'signIn', parsed.error)); return }
    if (!captchaToken) { setError('Complete the security verification and try again.'); return }
    setIsSubmitting(true)
    if (mode === 'sign-up') { const { error: signUpError } = await supabase.auth.signUp({ email: parsed.data.email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?flow=signup`, captchaToken } }); setIsSubmitting(false); resetCaptcha(); if (signUpError) { setError(genericAuthError); return }; setNotice('Check your email to verify your address and finish creating your account.'); return }
    if (mode === 'reset') { await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${window.location.origin}/auth/callback?flow=recovery`, captchaToken }); setIsSubmitting(false); resetCaptcha(); setNotice(resetNotice); return }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password, options: { captchaToken } }); setIsSubmitting(false); resetCaptcha(); if (signInError) setError(genericAuthError)
  }
  const isSignUp = mode === 'sign-up'; const title = isSignUp ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'; const intro = isSignUp ? 'Create an account, then verify your email before accessing your private workspace.' : mode === 'reset' ? 'Enter your email address. We’ll send a recovery link if it matches an account.' : 'Sign in to see your private portfolio.'
  return <main className="auth-shell"><section className="auth-panel" aria-labelledby="auth-title"><div className="brand-mark" aria-hidden="true"><KeyRound size={22} /></div><p className="brand-name">Wealth Intelligence</p><h1 id="auth-title">{title}</h1><p className="auth-intro">{intro}</p><form className="auth-form" onSubmit={submit} noValidate><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />{mode !== 'reset' && <><label htmlFor="password">Password</label><input id="password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></>}<Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />{error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message notice" role="status">{notice}</p>}<button className="primary-button" type="submit" disabled={isSubmitting}>{isSignUp ? <UserPlus size={18} /> : <LogIn size={18} />}{isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : mode === 'reset' ? 'Send recovery link' : 'Sign in'}</button></form><div className="auth-links"><button className="text-button" type="button" onClick={() => changeMode(isSignUp ? 'sign-in' : 'sign-up')}>{isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>{mode !== 'reset' ? <button className="text-button" type="button" onClick={() => changeMode('reset')}>Forgot your password?</button> : <button className="text-button" type="button" onClick={() => changeMode('sign-in')}>Return to sign in</button>}</div></section></main>
}

function EmailLinkCallback({ flow }: { flow: 'recovery' | 'signup' }) {
  const navigate = useNavigate(); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [isSubmitting, setIsSubmitting] = useState(false); const [status, setStatus] = useState<'checking' | 'mfa' | 'ready' | 'invalid' | 'security-error'>('checking'); const [factorId, setFactorId] = useState<string | null>(null); const [recoveryWasPending] = useState(() => hasPendingRecovery()); const [hashParams] = useState(() => { if (flow === 'recovery') markPendingRecovery(); return new URLSearchParams(window.location.hash.slice(1)) })
  async function assessRecoveryMfa() {
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError) { setStatus('security-error'); return }
    if (assurance?.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
      const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors()
      const factor = factorData?.all.find((candidate) => candidate.status === 'verified' && candidate.factor_type === 'totp')
      if (factorError || !factor) { setStatus('security-error'); return }
      setFactorId(factor.id); setStatus('mfa'); return
    }
    setStatus('ready')
  }
  useEffect(() => {
    const accessToken = hashParams.get('access_token'); const refreshToken = hashParams.get('refresh_token')
    if (!accessToken || !refreshToken) {
      if (flow !== 'recovery' || !recoveryWasPending) { clearPendingRecovery(); setStatus('invalid'); return }
      void supabase.auth.getSession().then(({ data }) => { if (data.session) void assessRecoveryMfa(); else { clearPendingRecovery(); setStatus('invalid') } })
      return
    }
    let active = true
    void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError || !data.session) { clearPendingRecovery(); setStatus('invalid') }
      else if (flow === 'recovery') void assessRecoveryMfa()
      else setStatus('ready')
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`)
    })
    return () => { active = false }
  }, [flow, hashParams])
  if (status === 'checking') return <main className="auth-shell"><p className="status-copy">Confirming your secure session…</p></main>
  if (status === 'invalid' && flow === 'recovery') return <main className="auth-shell"><section className="auth-panel" aria-labelledby="recovery-link-title"><h1 id="recovery-link-title">This recovery link can’t be used</h1><p className="auth-intro">Recovery links expire and can be used only once. Request a new link to continue.</p><button className="primary-button" type="button" onClick={() => navigate('/auth?mode=reset', { replace: true })}>Request a new recovery link</button></section></main>
  if (status === 'invalid') return <main className="auth-shell"><section className="auth-panel"><h1>Check your email</h1><p className="auth-intro">Complete the link in your email, then return here to sign in.</p></section></main>
  if (status === 'security-error') return <main className="auth-shell"><section className="auth-panel"><h1>Security check unavailable</h1><p className="auth-intro" role="alert">We couldn’t complete that security action. Please try again.</p><button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Try again</button></section></main>
  if (status === 'mfa' && factorId) return <main className="auth-shell"><section className="auth-panel" aria-labelledby="recovery-mfa-title"><div className="brand-mark" aria-hidden="true"><KeyRound size={22} /></div><h1 id="recovery-mfa-title">Confirm it’s you</h1><p className="auth-intro">An authenticator code is required because this account has multi-factor authentication enabled. Enter a code to continue resetting your password.</p><MfaCodeForm factorId={factorId} submitLabel="Verify and set password" onVerified={assessRecoveryMfa} /><p className="security-note">If you lose both your password and all authenticator factors, this account cannot be recovered.</p></section></main>
  if (flow === 'signup') return <Navigate to="/" replace />
  async function savePassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const parsed = invitationPasswordInputSchema.safeParse({ password }); if (!parsed.success) { setError(validationErrorMessage('invitationPassword', parsed.error)); return }; setIsSubmitting(true); const { error: updateError } = await supabase.auth.updateUser(parsed.data); setIsSubmitting(false); if (updateError) { setError('We couldn’t set your password. Please try again.'); return }; clearPendingRecovery(); navigate('/', { replace: true }) }
  return <main className="auth-shell"><section className="auth-panel" aria-labelledby="set-password-title"><h1 id="set-password-title">Set a new password</h1><p className="auth-intro">Choose a new password to finish recovering your private workspace.</p><form className="auth-form" onSubmit={savePassword} noValidate><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />{error && <p className="form-message error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Continue to portfolio'}</button></form></section></main>
}

export function AuthCallbackPage() {
  const session = useSession(); const navigate = useNavigate(); const [searchParams] = useSearchParams(); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [isSubmitting, setIsSubmitting] = useState(false); const callbackType = searchParams.get('flow') ?? new URLSearchParams(window.location.hash.slice(1)).get('type')
  if (callbackType === 'recovery' || (hasPendingRecovery() && session)) return <EmailLinkCallback flow="recovery" />
  if (callbackType === 'signup') return <EmailLinkCallback flow="signup" />
  if (session && callbackType !== 'recovery' && callbackType !== 'invite') return <main className="auth-shell"><section className="auth-panel"><h1>Check your email</h1><p className="auth-intro">Complete the link in your email, then return here to sign in.</p></section></main>
  if (session === undefined) return <main className="auth-shell"><p className="status-copy">Confirming your secure session…</p></main>
  if (session) { async function savePassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const parsed = invitationPasswordInputSchema.safeParse({ password }); if (!parsed.success) { setError(validationErrorMessage('invitationPassword', parsed.error)); return }; setIsSubmitting(true); const { error: updateError } = await supabase.auth.updateUser(parsed.data); setIsSubmitting(false); if (updateError) { setError('We couldn’t set your password. Please try again.'); return }; navigate('/holdings', { replace: true }) }; return <main className="auth-shell"><section className="auth-panel" aria-labelledby="set-password-title"><h1 id="set-password-title">Set a new password</h1><p className="auth-intro">Choose a new password to finish recovering your private workspace.</p><form className="auth-form" onSubmit={savePassword} noValidate><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />{error && <p className="form-message error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Continue to portfolio'}</button></form></section></main> }
  return <main className="auth-shell"><section className="auth-panel"><h1>Check your email</h1><p className="auth-intro">Complete the link in your email, then return here to sign in.</p></section></main>
}
export function ProtectedRoute() { const session = useSession(); if (session === undefined) return <main className="auth-shell"><p className="status-copy">Loading your secure workspace…</p></main>; return session ? <Outlet /> : <Navigate to="/auth" replace /> }
export function RecoveryRouteGuard() { const session = useSession(); return session && hasPendingRecovery() ? <Navigate to="/auth/callback?flow=recovery" replace /> : <Outlet /> }
export function SignOutButton() { const navigate = useNavigate(); const queryClient = useQueryClient(); async function signOut() { await supabase.auth.signOut(); queryClient.clear(); navigate('/auth', { replace: true }) }; return <button className="text-button" type="button" onClick={() => void signOut()}>Sign out</button> }
