import { Navigate, Route, Routes } from 'react-router-dom'
import { BrowserRouter } from 'react-router-dom'
import { AuthCallbackPage, AuthPage, ProtectedRoute } from '@/features/auth/AuthPages'
import { MfaChallengePage, MfaGuard, SecurityPage } from '@/features/auth/MfaPages'
import { AccountsPage, HoldingsPage } from '@/features/portfolio/PortfolioPage'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { AppShell } from '@/components/AppShell'
import { ValueItemsPage } from '@/features/assets/ValueItemsPage'

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/auth/mfa" element={<MfaChallengePage />} />
            <Route element={<MfaGuard />}>
              <Route element={<AppShell />}>
                <Route path="/holdings" element={<HoldingsPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/assets" element={<ValueItemsPage kind="asset" />} />
                <Route path="/liabilities" element={<ValueItemsPage kind="liability" />} />
                <Route path="/security" element={<SecurityPage />} />
                <Route path="/portfolio" element={<Navigate to="/holdings" replace />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/holdings" replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
