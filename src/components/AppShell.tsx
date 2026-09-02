import { NavLink, Outlet } from 'react-router-dom'
import { SignOutButton } from '@/features/auth/AuthPages'

export function AppShell() {
  return <div className="app-shell"><header className="app-topbar"><span className="app-brand">Wealth Intelligence</span><nav aria-label="Primary navigation"><NavLink to="/holdings">Holdings</NavLink><NavLink to="/accounts">Accounts</NavLink></nav><div className="app-context"><span>Private workspace</span><SignOutButton /></div></header><main className="app-main"><Outlet /></main></div>
}
