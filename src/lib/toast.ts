import { useCallback } from 'react'

/**
 * Toast messages: short notices that slide in at the top right and disappear after a few
 * seconds (see components/Toaster.tsx, mounted once in App).
 *   toast('Booking accepted.')          success
 *   toast('Could not save.', 'error')   error
 */
export type ToastKind = 'success' | 'error' | 'info'
export type ToastItem = { id: number; kind: ToastKind; text: string }

const listeners = new Set<(item: ToastItem) => void>()
let nextId = 1

export function toast(text: string, kind: ToastKind = 'success') {
  if (!text) return
  const item = { id: nextId++, kind, text }
  listeners.forEach(listener => listener(item))
}

export function subscribeToasts(listener: (item: ToastItem) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Drop-in for a page's message state (`const [problem, setProblem] = useState('')`):
 * setting a message shows it as a toast instead of a banner that stays on the page.
 * The returned value is always empty, so the old inline banner no longer appears.
 */
export function useToastMessage(kind: ToastKind): [string, (text: string) => void] {
  const show = useCallback((text: string) => toast(text, kind), [kind])
  return ['', show]
}
