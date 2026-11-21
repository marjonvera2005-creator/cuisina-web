import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { subscribeToasts } from '../lib/toast'
import type { ToastItem } from '../lib/toast'

/** How long a toast stays: 3 seconds, errors a little longer so they can be read. */
const SHOW_MS = { success: 3000, info: 3000, error: 5000 }
const LEAVE_MS = 250

/** The toast stack (top right). Mounted once in App. */
export function Toaster() {
  const [items, setItems] = useState<(ToastItem & { leaving?: boolean })[]>([])

  useEffect(() => subscribeToasts(item => {
    // The same message twice in a row (e.g. a double click) shows once.
    setItems(current => current.some(t => t.text === item.text && !t.leaving) ? current : [...current.slice(-3), item])
    window.setTimeout(() => close(item.id), SHOW_MS[item.kind])
  }), [])

  function close(id: number) {
    setItems(current => current.map(t => t.id === id ? { ...t, leaving: true } : t))
    window.setTimeout(() => setItems(current => current.filter(t => t.id !== id)), LEAVE_MS)
  }

  return (
    <div className="toaster" aria-live="polite">
      {items.map(item => (
        <div key={item.id} className={`toast ${item.kind}${item.leaving ? ' leaving' : ''}`} role={item.kind === 'error' ? 'alert' : 'status'}>
          {item.kind === 'success' ? <CheckCircle size={20} weight="fill" /> : item.kind === 'error' ? <WarningCircle size={20} weight="fill" /> : <Info size={20} weight="fill" />}
          <span>{item.text}</span>
          <button type="button" onClick={() => close(item.id)} aria-label="Close message"><X size={14} weight="bold" /></button>
          <i className="toast-timer" style={{ animationDuration: `${SHOW_MS[item.kind]}ms` }} />
        </div>
      ))}
    </div>
  )
}
