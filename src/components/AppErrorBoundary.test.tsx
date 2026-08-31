// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

function ThrowingChild(): never {
  throw new Error('Sensitive database failure')
}

describe('AppErrorBoundary', () => {
  it('contains a render failure without exposing its message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<AppErrorBoundary><ThrowingChild /></AppErrorBoundary>)

    expect(screen.getByRole('heading', { name: 'We couldn’t display this page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Sensitive database failure')).toBeNull()
  })
})
