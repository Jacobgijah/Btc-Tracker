import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './ui'

/** Modal confirmation using <dialog>: traps focus, closes on Escape. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmIcon,
  busy = false,
  canConfirm = true,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  /** Icon on the (outline) confirm button, so it doesn't rely on its blue border alone. */
  confirmIcon?: ReactNode
  busy?: boolean
  /** false hides the confirm button (e.g. after the action was refused). */
  canConfirm?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(e) => {
        // Click on the backdrop closes.
        if (e.target === ref.current && !busy) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border-strong bg-surface p-0 text-text backdrop:bg-backdrop"
    >
      {open && (
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div className="mt-2 space-y-3 text-sm text-text">{children}</div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={onClose} disabled={busy} autoFocus>
              Cancel
            </Button>
            {canConfirm && (
              <Button variant="danger" onClick={onConfirm} disabled={busy}>
                {confirmIcon}
                {busy ? 'Working…' : confirmLabel}
              </Button>
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}
