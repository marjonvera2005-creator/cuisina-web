import { useEffect, useState } from 'react'
import L from 'leaflet'

/**
 * Light or dark map style, shared by every map on the page and remembered in this browser.
 * Switching it updates the tiles of every open map at once.
 */
const key = import.meta.env.VITE_MAPTILER_KEY as string | undefined
const STORAGE = 'cuisina-map-dark'

let dark = (() => { try { return localStorage.getItem(STORAGE) === '1' } catch { return false } })()
const layers = new Set<L.TileLayer>()
const listeners = new Set<(dark: boolean) => void>()

export const tileUrl = (isDark: boolean) =>
  `https://api.maptiler.com/maps/${isDark ? 'streets-v2-dark' : 'streets-v2'}/256/{z}/{x}/{y}.png?key=${key}`

const ATTRIBUTION = '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'

/** Adds MapTiler street tiles in the current style; they follow later style changes. */
export function addTiles(map: L.Map): L.TileLayer {
  const layer = L.tileLayer(tileUrl(dark), { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map)
  layers.add(layer)
  map.on('unload', () => layers.delete(layer))
  return layer
}

export function setMapDark(value: boolean) {
  dark = value
  try { localStorage.setItem(STORAGE, value ? '1' : '0') } catch { /* private window: keep it for this page only */ }
  for (const layer of layers) layer.setUrl(tileUrl(value))
  for (const listener of listeners) listener(value)
}

/** The current map style; re-renders when it changes. */
export function useMapDark(): boolean {
  const [value, setValue] = useState(dark)
  useEffect(() => {
    listeners.add(setValue)
    setValue(dark)
    return () => { listeners.delete(setValue) }
  }, [])
  return value
}
