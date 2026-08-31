import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type AppErrorBoundaryProps = { children: ReactNode }
type AppErrorBoundaryState = { hasError: boolean }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Deliberately do not log errors: they can contain financial or database details.
  }

  private tryAgain = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="auth-shell">
          <section className="auth-panel app-error-boundary" aria-labelledby="app-error-heading">
            <h1 id="app-error-heading">We couldn’t display this page</h1>
            <p className="auth-intro">Please try again. If the problem continues, sign out and return later.</p>
            <button className="primary-button" type="button" onClick={this.tryAgain}>Try again</button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
