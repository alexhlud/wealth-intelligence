import { Navigate, Route, Routes } from 'react-router-dom'
import { BrowserRouter } from 'react-router-dom'
import { AuthCallbackPage, AuthPage, ProtectedRoute } from '@/features/auth/AuthPages'
import { PortfolioPage } from '@/features/portfolio/PortfolioPage'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/portfolio" element={<PortfolioPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/portfolio" replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
