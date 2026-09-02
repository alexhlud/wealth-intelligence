import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { Button } from './Button'

export function LoadingState({ children = 'Loading…' }: { children?: ReactNode }) { return <p className="state-copy" aria-live="polite">{children}</p> }
export function EmptyState({ children }: { children: ReactNode }) { return <p className="empty-state">{children}</p> }
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return <div className="error-state" role="alert"><CircleAlert size={18} /><span>We couldn’t load this information.</span>{onRetry && <Button className="button-secondary" onClick={onRetry}>Try again</Button>}</div>
}
export function StaleDataNotice({ children }: { children: ReactNode }) { return <p className="stale-notice" role="status">{children}</p> }
