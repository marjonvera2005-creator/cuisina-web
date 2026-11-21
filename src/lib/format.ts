export function peso(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  // Plain dates (YYYY-MM-DD) must not shift with the viewer's timezone.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return ''
  const [h, m] = value.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function label(value: string): string {
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/**
 * Caterer-facing booking numbers (BK-0001, BK-0002, ...): each caterer's bookings numbered
 * in the order they were requested. Bookings are never deleted, so a number never changes.
 */
export function bookingNumbers(bookings: { id: string; created_at: string }[]): Map<string, string> {
  const ordered = [...bookings].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  return new Map(ordered.map((booking, index) => [booking.id, `BK-${String(index + 1).padStart(4, '0')}`]))
}

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Packages in name order with numbers read as numbers: Package 1, Package 2, ..., Package 10. */
export function byPackageName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => nameCollator.compare(a.name, b.name))
}
