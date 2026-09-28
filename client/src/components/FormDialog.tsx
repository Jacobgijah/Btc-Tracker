import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react'
import { Button } from './ui'

/** Modal form using <dialog>: same shell as ConfirmDialog, but renders a <form> with its own fields. */
export function FormDialog({
  open,
  title,
  children,
  submitLabel,
  submitIcon,
  busy = false,
  onSubmit,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  submitLabel: string
  submitIcon?: ReactNode
  busy?: boolean
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
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
        <form onSubmit={onSubmit} noValidate className="p-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div className="mt-3 space-y-3">{children}</div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" onClick={onClose} disabled={busy} className="cursor-pointer">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy} className="cursor-pointer">
              {submitIcon}
              {busy ? 'Working…' : submitLabel}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  )
}
