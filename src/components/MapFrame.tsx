import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { ArrowsIn, ArrowsOut, Moon, Storefront, Sun } from '@phosphor-icons/react'
import { setMapDark, useMapDark } from './mapStyle'
import { setShowOthers, useShowOthers } from './otherCaterers'

/**
 * Wraps a Leaflet map with buttons: full screen on/off, light/dark map style and (optional)
 * show/hide the other caterers' pins.
 * Full screen covers the whole window (Esc or the button returns to the small map).
 */
/** What the frame needs from a map: re-measure after resizing, and mouse-wheel zoom on/off (Leaflet, or the globe map's adapter). */
export type FramedMap = { invalidateSize(): unknown; scrollWheelZoom: { enabled(): boolean; enable(): unknown; disable(): unknown } }

export function MapFrame({ map, children, others = false }: { map: RefObject<FramedMap | null>; children: ReactNode; others?: boolean }) {
  const [full, setFull] = useState(false)
  const dark = useMapDark()
  const showOthers = useShowOthers()
  const wheelAtStart = useRef<boolean | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const spot = useRef<HTMLDivElement>(null)

  // Full screen: lift the map to the top of the page, so animated page sections cannot trap it
  // (an animated parent would keep the "full screen" map inside that section, buttons off screen).
  useLayoutEffect(() => {
    const el = frame.current, home = spot.current
    if (!full || !el || !home) return
    // Into the app's root element (not <body>): React only handles clicks inside its root.
    ;(document.getElementById('root') ?? document.body).appendChild(el)
    return () => { home.after(el) }
  }, [full])

  // Leaflet must re-measure after the size changes; mouse-wheel zoom only in full screen.
  useEffect(() => {
    const m = map.current
    if (!m) return
    // Twice: once right away and once after the layout has fully settled.
    const ids = [60, 350].map(ms => window.setTimeout(() => m.invalidateSize(), ms))
    // Remember whether this map zooms with the mouse wheel when small, and restore that on exit.
    if (wheelAtStart.current === null) wheelAtStart.current = m.scrollWheelZoom.enabled()
    if (full) m.scrollWheelZoom.enable()
    else if (!wheelAtStart.current) m.scrollWheelZoom.disable()
    document.body.classList.toggle('map-full-open', full)
    return () => ids.forEach(id => window.clearTimeout(id))
  }, [full, map])

  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('map-full-open') }
  }, [full])

  return (
    <>
      <div ref={spot} hidden />
      <div ref={frame} className={`map-frame${full ? ' map-frame-full' : ''}`}>
        {children}
        <div className="map-frame-buttons">
          <button type="button" className="map-frame-button" onClick={() => setFull(f => !f)}
            title={full ? 'Exit full screen (Esc)' : 'View full screen'} aria-label={full ? 'Exit full screen' : 'View full screen'}>
            {full ? <ArrowsIn size={20} weight="bold" /> : <ArrowsOut size={20} weight="bold" />}
          </button>
          <button type="button" className="map-frame-button" onClick={() => setMapDark(!dark)}
            title={dark ? 'Light map' : 'Dark map'} aria-label={dark ? 'Switch to light map' : 'Switch to dark map'} aria-pressed={dark}>
            {dark ? <Sun size={20} weight="bold" /> : <Moon size={20} weight="bold" />}
          </button>
          {others && (
            <button type="button" className={`map-frame-button${showOthers ? ' is-on' : ''}`} onClick={() => setShowOthers(!showOthers)}
              title={showOthers ? 'Hide other caterers' : 'Show other caterers'} aria-label="Show other caterers" aria-pressed={showOthers}>
              <Storefront size={20} weight={showOthers ? 'fill' : 'bold'} />
            </button>
          )}
        </div>
      </div>
    </>
  )
}
