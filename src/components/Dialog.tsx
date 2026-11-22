import { Info, PencilSimpleLine, Question, Warning } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { IconTile } from './IconTile'

type Props = {
  title: string
  description?: string
  confirmLabel: string
  /** When set, a text area is shown and its value is passed to onConfirm. */
  inputLabel?: string
  inputRequired?: boolean
  danger?: boolean
  /** Text of the cancel button (default "Go back"). */
  cancelLabel?: string
  /** Message only: just one OK button. */
  hideCancel?: boolean
  onConfirm: (value: string) => void | Promise<void>
  onCancel: () => void
  children?: ReactNode
  /** Example text inside the text area. */
  inputPlaceholder?: string
  /** A problem with what was typed: shown under the text area, then fades away after 3 seconds. */
  error?: string
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export function ConfirmDialog({ title, description, confirmLabel, cancelLabel = 'Go back', hideCancel, inputLabel, inputRequired, danger, onConfirm, onCancel, children, inputPlaceholder, error }: Props) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  // Every Send attempt shows the error again, even when the text is the same as last time.
  const [attempt, setAttempt] = useState(0)
  const [shownError, setShownError] = useState('')
  useEffect(() => {
    if (!error) { setShownError(''); return }
    setShownError(error)
    const timer = window.setTimeout(() => setShownError(''), 3000)
    return () => window.clearTimeout(timer)
  }, [error, attempt])
  const formRef = useRef<HTMLFormElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  // Focus moves into the dialog when it opens and returns to the button that opened it when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const form = formRef.current
    const first = form?.querySelector<HTMLElement>('textarea, input') ?? form?.querySelector<HTMLElement>('button[type="submit"], button:not([type])')
    first?.focus()
    return () => { opener?.focus?.() }
  }, [])

  // Escape closes; Tab stays inside the dialog.
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onCancel(); return }
    if (event.key !== 'Tab' || !formRef.current) return
    const items = [...formRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0], last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try { await onConfirm(value.trim()) } finally { setBusy(false); setAttempt(n => n + 1) }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <form ref={formRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined} onSubmit={submit} onKeyDown={onKeyDown}>
        <div className="dialog-head">
          {danger ? <IconTile icon={Warning} tone="red" /> : hideCancel ? <IconTile icon={Info} tone="blue" />
            : inputLabel || children ? <IconTile icon={PencilSimpleLine} tone="gold" /> : <IconTile icon={Question} tone="green" />}
          <h2 id={titleId}>{title}</h2>
        </div>
        {description && <p id={descriptionId}>{description}</p>}
        {children}
        {inputLabel && (
          <label>{inputLabel}
            <textarea value={value} onChange={event => setValue(event.target.value)} rows={3} required={inputRequired} placeholder={inputPlaceholder} />
          </label>
        )}
        {shownError && <div key={`${shownError}-${attempt}`} className="form-error fade-out-3s" role="alert">{shownError}</div>}
        <div className="dialog-actions">
          {!hideCancel && <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>{cancelLabel}</button>}
          <button type="submit" className={danger ? 'danger-button' : 'admin-primary'} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </form>
    </div>
  )
}
