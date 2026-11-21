/** Shared helpers for the admin and owner Reports pages: periods, and grouping by week, month or year. */

export const PERIODS = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: '6-months', label: 'Last 6 months' },
  { value: 'this-year', label: 'This year' },
  { value: 'all', label: 'All time' },
] as const
export type Period = (typeof PERIODS)[number]['value']

export const GROUPS = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
] as const
export type Group = (typeof GROUPS)[number]['value']

const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** First and last day (YYYY-MM-DD) of a period; null = all time. */
export function periodRange(period: Period): [string, string] | null {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth()
  if (period === 'this-month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))]
  if (period === 'last-month') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
  if (period === '6-months') return [iso(new Date(y, m - 5, 1)), iso(new Date(y, m + 1, 0))]
  if (period === 'this-year') return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))]
  return null
}

export const inPeriod = (date: string, period: Period) => {
  const span = periodRange(period)
  return !span || (date >= span[0] && date <= span[1])
}

/** Key that sorts in time order: the Monday of the week, the month, or the year. */
export function groupKey(date: string, group: Group): string {
  if (group === 'year') return date.slice(0, 4)
  if (group === 'month') return date.slice(0, 7)
  const d = new Date(`${date}T00:00:00`)
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return iso(monday)
}

export function groupLabel(key: string, group: Group): string {
  if (group === 'year') return key
  if (group === 'month') return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  const start = new Date(`${key}T00:00:00`)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  const short = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  return `${short(start)} – ${short(end)}, ${end.getFullYear()}`
}

/** Every week / month / year key from one date to another (so empty periods still show). */
export function bucketKeys(from: string, to: string, group: Group): string[] {
  const keys: string[] = []
  const end = groupKey(to, group)
  let key = groupKey(from, group)
  for (let guard = 0; key <= end && guard < 600; guard++) {
    keys.push(key)
    if (group === 'year') key = String(Number(key) + 1)
    else if (group === 'month') { const d = new Date(`${key}-01T00:00:00`); d.setMonth(d.getMonth() + 1); key = iso(d).slice(0, 7) }
    else { const d = new Date(`${key}T00:00:00`); d.setDate(d.getDate() + 7); key = iso(d) }
  }
  return keys
}

/** Short peso amounts for chart axes: ₱950, ₱45k, ₱125.6k, ₱1.2M. */
export function compactPeso(value: number): string {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 1000) return `₱${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `₱${Math.round(value)}`
}

/** Short chart label: the week's first day, the month, or the year. */
export function shortGroupLabel(key: string, group: Group): string {
  if (group === 'year') return key
  if (group === 'month') return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
  return new Date(`${key}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

/** Saves rows as a CSV file that opens in Excel. */
export function downloadCsv(fileName: string, head: string[], rows: (string | number)[][]) {
  const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const text = [head, ...rows].map(row => row.map(quote).join(',')).join('\r\n')
  const blob = new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' })
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName })
  link.click()
  URL.revokeObjectURL(link.href)
}
