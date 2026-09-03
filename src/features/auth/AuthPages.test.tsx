// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthCallbackPage } from './AuthPages'

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }))

vi.mock('./session', () => ({ useSession }))
vi.mock('./Turnstile', () => ({ Turnstile: () => null }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: vi.fn(), signOut: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(), signInWithPassword: vi.fn() } },
}))

function renderCallback(flow: 'signup' | 'recovery') {
  return render(<MemoryRouter initialEntries={[`/auth/callback?flow=${flow}`]}><Routes><Route path="/auth/callback" element={<AuthCallbackPage />} /><Route path="/holdings" element={<p>Holdings destination</p>} /></Routes></MemoryRouter>)
}

describe('AuthCallbackPage', () => {
  afterEach(() => { cleanup(); useSession.mockReset() })

  it('routes a confirmed signup to holdings instead of the password recovery screen', async () => {
    useSession.mockReturnValue({})
    renderCallback('signup')

    expect(await screen.findByText('Holdings destination')).toBeTruthy()
    expect(screen.queryByText('Set a new password')).toBeNull()
    expect(screen.queryByText(/finish recovering your private workspace/)).toBeNull()
  })

  it('keeps the password form exclusive to a recovery callback', () => {
    useSession.mockReturnValue({})
    renderCallback('recovery')

    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeTruthy()
    expect(screen.getByText(/finish recovering your private workspace/)).toBeTruthy()
  })
})
