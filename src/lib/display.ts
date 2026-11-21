import { useSyncExternalStore } from 'react'

/** Accessibility & display: text size and high contrast, saved in this browser. */
export type TextSize = 'small' | 'normal' | 'large' | 'xlarge'
export type Display = { textSize: TextSize; highContrast: boolean }

export const TEXT_SIZES: { value: TextSize; label: string; zoom: number }[] = [
  { value: 'small', label: 'Small', zoom: 0.9 },
  { value: 'normal', label: 'Normal', zoom: 1 },
  { value: 'large', label: 'Large', zoom: 1.15 },
  { value: 'xlarge', label: 'Extra large', zoom: 1.3 },
]

const KEY = 'cuisina-display'
const DEFAULT: Display = { textSize: 'normal', highContrast: false }
const listeners = new Set<() => void>()
let current: Display = read()

// UNMARSHALLING: the saved JSON text back into the display settings.
function read(): Display {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Display> | null
    return {
      textSize: TEXT_SIZES.some(s => s.value === saved?.textSize) ? saved!.textSize! : DEFAULT.textSize,
      highContrast: Boolean(saved?.highContrast),
    }
  } catch { return DEFAULT }
}

/** Puts the settings on the page: the whole page is zoomed for text size; a class turns on high contrast. */
export function applyDisplay(display: Display = current) {
  const root = document.documentElement
  const zoom = TEXT_SIZES.find(s => s.value === display.textSize)?.zoom ?? 1
  root.style.zoom = zoom === 1 ? '' : String(zoom)
  root.classList.toggle('high-contrast', display.highContrast)
}

export function setDisplay(next: Partial<Display>) {
  current = { ...current, ...next }
  // MARSHALLING: the settings as JSON text in localStorage.
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* storage blocked: still applies for this visit */ }
  applyDisplay(current)
  listeners.forEach(fn => fn())
}

export function useDisplay(): Display {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => current)
}
