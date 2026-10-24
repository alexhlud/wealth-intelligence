// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SaveSnapshotDialog } from './SnapshotsPage'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const portfolioId = '11111111-1111-1111-1111-111111111111'
const session = { asOfDate: '2026-10-23', marketCloseAt: '2026-10-23T20:00:00.000Z', closeTimeEt: '16:00' as const }

function renderDialog(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<MemoryRouter><QueryClientProvider client={client}><SaveSnapshotDialog portfolioId={portfolioId} onClose={onClose} /></QueryClientProvider></MemoryRouter>)
  return { client, onClose }
}

async function prepare() {
  fireEvent.click(screen.getByRole('button', { name: 'Prepare snapshot' }))
  await screen.findByRole('button', { name: 'Save snapshot' })
}

describe('SaveSnapshotDialog', () => {
  afterEach(() => { cleanup(); invoke.mockReset() })

  it('saves a prepared snapshot, invalidates its list, and closes', async () => {
    const { client, onClose } = renderDialog()
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries')
    invoke.mockResolvedValueOnce({ data: { snapshot: { kind: 'ready', session, positionCount: 1, manualAssetCount: 0, liabilityCount: 0 } }, error: null })
      .mockResolvedValueOnce({ data: { snapshot: { kind: 'saved', snapshotId: '22222222-2222-2222-2222-222222222222', session } }, error: null })

    await prepare()
    fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invoke.mock.calls[0]?.[1]).toEqual({ body: { operation: 'snapshot_preview', portfolioId } })
    expect(invoke.mock.calls[1]?.[1]?.body).toMatchObject({ operation: 'save_snapshot', portfolioId })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['snapshots', portfolioId] })
  })

  it('keeps the dialog open and announces an MFA verification requirement after a failed save', async () => {
    const { onClose } = renderDialog()
    invoke.mockResolvedValueOnce({ data: { snapshot: { kind: 'ready', session, positionCount: 1, manualAssetCount: 0, liabilityCount: 0 } }, error: null })
      .mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ error: 'Snapshot save requires verification.', reason: 'mfa_required' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) } })

    await prepare()
    fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Your secure session needs verification before a snapshot can be saved.')
    expect(screen.getByRole('button', { name: 'Verify session' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('MFA verification required')).toBeNull()
  })
})
