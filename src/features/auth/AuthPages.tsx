import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogIn, UserPlus } from 'lucide-react'
import { signInInputSchema } from '@/lib/validation'
import { supabase } from '@/lib/supabase'

const invitationMessage = 'We couldn’t create an account with those details. If you have an invitation, use the link in its email.'

function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  return session
}

export function AuthPage() {
  const session = useSession()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (session) return <Navigate to="/portfolio" replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    const parsed = signInInputSchema.safeParse({ email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details and try again.')
      return
    }

    setIsSubmitting(true)
    if (mode === 'sign-up') {
      const { error: signUpError } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      setIsSubmitting(false)
      if (signUpError) {
        setError(invitationMessage)
        return
      }
      setNotice(invitationMessage)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data)
    setIsSubmitting(false)
    if (signInError) setError('We couldn’t sign you in with those details. Check your invitation and try again.')
  }

  const isSignUp = mode === 'sign-up'
  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true"><KeyRound size={22} /></div>
        <p className="brand-name">Wealth Intelligence</p>
        <h1 id="auth-title">{isSignUp ? 'Request access' : 'Welcome back'}</h1>
        <p className="auth-intro">
          {isSignUp
            ? 'Access is reserved for invited members. Use your invitation email to begin.'
            : 'Sign in to see your private portfolio.'}
        </p>
        <form className="auth-form" onSubmit={submit} noValidate>
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p className="form-message error" role="alert">{error}</p>}
          {notice && <p className="form-message notice" role="status">{notice}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSignUp ? <UserPlus size={18} /> : <LogIn size={18} />}
            {isSubmitting ? 'Please wait…' : isSignUp ? 'Request access' : 'Sign in'}
          </button>
        </form>
        <button className="text-button" type="button" onClick={() => { setMode(isSignUp ? 'sign-in' : 'sign-up'); setError(null); setNotice(null) }}>
          {isSignUp ? 'Already invited? Sign in' : 'Need an invitation? Request access'}
        </button>
      </section>
    </main>
  )
}

export function AuthCallbackPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  if (session === undefined) return <main className="auth-shell"><p className="status-copy">Confirming your secure session…</p></main>
  if (session) {
    async function savePassword(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      if (password.length < 8 || password.length > 128) {
        setError('Use a password between 8 and 128 characters.')
        return
      }
      setIsSubmitting(true)
      const { error: updateError } = await supabase.auth.updateUser({ password })
      setIsSubmitting(false)
      if (updateError) { setError('We couldn’t set your password. Please try again.'); return }
      navigate('/portfolio', { replace: true })
    }
    return <main className="auth-shell"><section className="auth-panel" aria-labelledby="set-password-title"><h1 id="set-password-title">Set your password</h1><p className="auth-intro">Your invitation is confirmed. Choose a password to finish setting up your private workspace.</p><form className="auth-form" onSubmit={savePassword} noValidate><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />{error && <p className="form-message error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Continue to portfolio'}</button></form></section></main>
  }
  return <main className="auth-shell"><section className="auth-panel"><h1>Check your email</h1><p className="auth-intro">Complete the link in your invitation, then return here to sign in.</p></section></main>
}

export function ProtectedRoute() {
  const session = useSession()
  if (session === undefined) return <main className="auth-shell"><p className="status-copy">Loading your secure workspace…</p></main>
  return session ? <Outlet /> : <Navigate to="/auth" replace />
}

export function SignOutButton() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
    navigate('/auth', { replace: true })
  }
  return <button className="text-button" type="button" onClick={() => void signOut()}>Sign out</button>
}
