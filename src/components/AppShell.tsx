import { NavLink, Outlet } from 'react-router-dom'
import { GlobalSignOutButton } from '@/features/auth/MfaPages'

export function AppShell() {
  return <div className="app-shell"><header className="app-topbar"><span className="app-brand">Wealth Intelligence</span><nav aria-label="Primary navigation"><NavLink to="/holdings">Holdings</NavLink><NavLink to="/accounts">Accounts</NavLink><NavLink to="/assets">Assets</NavLink><NavLink to="/liabilities">Liabilities</NavLink><NavLink to="/security">Security</NavLink></nav><div className="app-context"><span>Private workspace</span><GlobalSignOutButton /></div></header><main className="app-main"><Outlet /></main></div>
}
