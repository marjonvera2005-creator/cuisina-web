/**
 * Keeps the bell and the Notifications page in step: whenever the page marks something read
 * (or reloads), it calls unreadChanged() and the bell counts again from the database.
 */
type Listener = () => void
const listeners = new Set<Listener>()

export function onUnreadChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function unreadChanged() {
  listeners.forEach(listener => listener())
}
