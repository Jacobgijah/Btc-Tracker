import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './ui'

/** Modal confirmation using <dialog>: traps focus, closes on Escape. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy = false,
  canConfirm = true,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
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
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {open && (
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div className="mt-2 space-y-3 text-sm text-slate-700 dark:text-slate-300">{children}</div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={onClose} disabled={busy} autoFocus>
              Cancel
            </Button>
            {canConfirm && (
              <Button variant="danger" onClick={onConfirm} disabled={busy}>
                {busy ? 'Working…' : confirmLabel}
              </Button>
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}
