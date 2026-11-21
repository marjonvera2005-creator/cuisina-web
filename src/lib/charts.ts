/** Categorical order, validated for color-vision deficiency on the cream surface. Assign in order, never cycle. */
export const SERIES_COLORS = ['#2e7a45', '#b8822a', '#3f7fc4', '#c0503a', '#8a5cc4']

/** The last six calendar months as { key: 'YYYY-MM', label: 'Jan' }. */
export function lastSixMonths(): { key: string; label: string }[] {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: date.toLocaleDateString('en-PH', { month: 'short' }) }
  })
}

/** The last `count` calendar months, oldest first, as { key: 'YYYY-MM', label: 'Jan' }. */
export function lastMonths(count: number): { key: string; label: string }[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1) + i, 1)
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: date.toLocaleDateString('en-PH', { month: 'short' }) }
  })
}
