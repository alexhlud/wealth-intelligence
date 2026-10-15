// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthCallbackPage, AuthPage } from './AuthPages'

const { challenge, getAuthenticatorAssuranceLevel, listFactors, setSession, signInWithPassword, updateUser, useSession, verify } = vi.hoisted(() => ({ challenge: vi.fn(), getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), setSession: vi.fn(), signInWithPassword: vi.fn(), updateUser: vi.fn(), useSession: vi.fn(), verify: vi.fn() }))

vi.mock('./session', () => ({ useSession }))
vi.mock('./Turnstile', () => ({ Turnstile: ({ onToken }: { onToken: (token: string) => void }) => <button type="button" onClick={() => onToken('captcha-token')}>Complete verification</button> }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { setSession, updateUser, signOut: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(), signInWithPassword, mfa: { challenge, getAuthenticatorAssuranceLevel, listFactors, verify } } },
}))

function renderCallback(flow: 'signup' | 'recovery', hash = '#access_token=access-token&refresh_token=refresh-token&type=recovery') {
  window.history.replaceState({}, '', `/auth/callback?flow=${flow}${hash}`)
  return render(<MemoryRouter initialEntries={[`/auth/callback?flow=${flow}`]}><Routes><Route path="/auth/callback" element={<AuthCallbackPage />} /><Route path="/auth" element={<AuthPage />} /><Route path="/holdings" element={<p>Holdings destination</p>} /></Routes></MemoryRouter>)
}

describe('AuthCallbackPage', () => {
  afterEach(() => { cleanup(); challenge.mockReset(); getAuthenticatorAssuranceLevel.mockReset(); listFactors.mockReset(); setSession.mockReset(); signInWithPassword.mockReset(); updateUser.mockReset(); useSession.mockReset(); verify.mockReset(); window.history.replaceState({}, '', '/') })

  it('routes a confirmed signup to holdings instead of the password recovery screen', async () => {
    useSession.mockReturnValue(null)
    setSession.mockResolvedValue({ data: { session: {} }, error: null })
    renderCallback('signup')

    expect(await screen.findByText('Holdings destination')).toBeTruthy()
    expect(screen.queryByText('Set a new password')).toBeNull()
    expect(screen.queryByText(/finish recovering your private workspace/)).toBeNull()
  })

  it('updates directly after recovery when the account has no verified factor', async () => {
    useSession.mockReturnValue(null)
    setSession.mockResolvedValue({ data: { session: {} }, error: null })
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
    updateUser.mockResolvedValue({ error: null })
    renderCallback('recovery')

    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'new-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to portfolio' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'new-password' }))
    expect(setSession).toHaveBeenCalledWith({ access_token: 'access-token', refresh_token: 'refresh-token' })
    expect(await screen.findByText('Holdings destination')).toBeTruthy()
  })

  it('requires a successful MFA challenge before updating a recovered account password', async () => {
    useSession.mockReturnValue(null)
    setSession.mockResolvedValue({ data: { session: {} }, error: null })
    getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }).mockResolvedValueOnce({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
    listFactors.mockResolvedValue({ data: { all: [{ id: 'factor-1', status: 'verified', factor_type: 'totp' }] }, error: null })
    challenge.mockResolvedValue({ data: { id: 'challenge-1' }, error: null })
    verify.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ error: null })
    renderCallback('recovery')

    expect(await screen.findByText(/authenticator code is required because this account has multi-factor authentication enabled/i)).toBeTruthy()
    expect(screen.getByText(/lose both your password and all authenticator factors/i)).toBeTruthy()
    expect(updateUser).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify and set password' }))
    await waitFor(() => expect(verify).toHaveBeenCalledWith({ factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' }))
    expect(updateUser).not.toHaveBeenCalled()

    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'new-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to portfolio' }))
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'new-password' }))
  })

  it.each(['', '#access_token=expired-access&refresh_token=expired-refresh'])('shows the request-a-new-link state when recovery credentials are missing or invalid', async (hash) => {
    useSession.mockReturnValue(null)
    setSession.mockResolvedValue({ data: { session: null }, error: hash ? new Error('expired') : null })
    renderCallback('recovery', hash)

    expect(await screen.findByRole('heading', { name: 'This recovery link can’t be used' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Request a new recovery link' }))
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeTruthy()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('keeps normal password sign-in working', async () => {
    useSession.mockReturnValue(null)
    signInWithPassword.mockResolvedValue({ error: null })
    render(<MemoryRouter><AuthPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Complete verification' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: 'person@example.com', password: 'password1', options: { captchaToken: 'captcha-token' } }))
  })
})
