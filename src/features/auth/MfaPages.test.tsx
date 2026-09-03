// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MfaChallengePage } from './MfaPages'

const { listFactors, signOut } = vi.hoisted(() => ({
  listFactors: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: { listFactors },
      signOut,
    },
  },
}))

vi.mock('./session', () => ({
  useSession: () => ({ access_token: 'aal1-session' }),
}))

function renderChallenge(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/auth/mfa']}>
        <Routes>
          <Route path="/auth/mfa" element={<MfaChallengePage />} />
          <Route path="/auth" element={<p>Sign in</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderBrowserChallenge(client: QueryClient) {
  window.history.replaceState({}, '', '/auth/mfa')
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/mfa" element={<MfaChallengePage />} />
          <Route path="/auth" element={<p>Sign in</p>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('MfaChallengePage exits', () => {
  afterEach(() => {
    cleanup()
    listFactors.mockReset()
    signOut.mockReset()
  })

  it('signs out, clears cached data, and reaches sign in without returning to the challenge', async () => {
    listFactors.mockResolvedValue({ data: { all: [{ id: 'factor-1', status: 'verified', factor_type: 'totp' }] }, error: null })
    signOut.mockResolvedValue({ error: null })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['private-data'], { balance: '100' })
    const clear = vi.spyOn(client, 'clear')

    renderChallenge(client)
    fireEvent.click(await screen.findByRole('button', { name: 'Return to sign in' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }))
    await waitFor(() => expect(screen.getByText('Sign in')).toBeTruthy())
    expect(clear).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(['private-data'])).toBeUndefined()
    expect(screen.queryByText('Confirm it’s you')).toBeNull()
  })

  it('uses the same sign-out exit when browser Back changes history', async () => {
    listFactors.mockResolvedValue({ data: { all: [{ id: 'factor-1', status: 'verified', factor_type: 'totp' }] }, error: null })
    signOut.mockResolvedValue({ error: null })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    renderBrowserChallenge(client)
    fireEvent.popState(window)

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }))
    await waitFor(() => expect(screen.getByText('Sign in')).toBeTruthy())
    expect(screen.queryByText('Confirm it’s you')).toBeNull()
  })
})
