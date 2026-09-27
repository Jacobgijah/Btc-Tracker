import { useState, type ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Button } from '../../components/ui'
import { cx } from '../../lib/cx'
import { useAuth } from './AuthContext'

/**
 * A log-out button that asks first: "Yes, log out" logs out, "No" (or Escape /
 * clicking outside) just closes the question. Styling comes from the caller.
 */
export function LogoutButton({
  className,
  children,
  label,
  variant,
}: {
  className?: string
  /** Button content; the header uses an icon only. */
  children: ReactNode
  /** Accessible name / tooltip, for icon-only use. */
  label?: string
  /** Render as the shared Button in this style; without it, an unstyled button for `className`. */
  variant?: 'secondary' | 'ghost'
}) {
  const { logout } = useAuth()
  const [asking, setAsking] = useState(false)
  const trigger = {
    onClick: () => setAsking(true),
    className: cx('cursor-pointer', className),
    'aria-label': label,
    title: label,
    'aria-haspopup': 'dialog' as const,
  }

  return (
    <>
      {variant ? (
        <Button variant={variant} {...trigger}>
          {children}
        </Button>
      ) : (
        <button type="button" {...trigger}>
          {children}
        </button>
      )}
      <ConfirmDialog
        open={asking}
        title="Log out?"
        confirmLabel="Yes, log out"
        confirmIcon={<LogOut className="size-4" aria-hidden />}
        confirmVariant="primary"
        cancelLabel="No"
        onConfirm={() => {
          setAsking(false)
          logout()
        }}
        onClose={() => setAsking(false)}
      >
        <p>You'll need to sign in again to see your savings.</p>
      </ConfirmDialog>
    </>
  )
}
