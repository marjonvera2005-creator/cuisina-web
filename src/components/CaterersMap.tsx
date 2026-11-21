import { useEffect, useRef, useState } from 'react'
import { GlobeHemisphereEast } from '@phosphor-icons/react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { peso } from '../lib/format'
import { MapFrame } from './MapFrame'
import type { FramedMap } from './MapFrame'
import { useMapDark } from './mapStyle'
import { approvedCaterers, initials } from './otherCaterers'
import type { MapCaterer } from './otherCaterers'

const key = import.meta.env.VITE_MAPTILER_KEY as string | undefined

/** Biliran province, where Cuisina's caterers are. */
const BILIRAN: [[number, number], [number, number]] = [[124.2, 11.38], [124.7, 11.86]]
const SPACE = { center: [124.45, 14] as [number, number], zoom: 1.4 }

const styleUrl = (dark: boolean) => `https://api.maptiler.com/maps/${dark ? 'streets-v2-dark' : 'streets-v2'}/style.json?key=${key}`
const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

function pin(c: MapCaterer): maplibregl.Marker {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'other-caterer-pin globe-pin'
  el.title = c.name
  el.setAttribute('aria-label', c.name)
  el.innerHTML = c.logo ? `<img src="${escape(c.logo)}" alt="" />` : `<span>${escape(initials(c.name))}</span>`
  const details = [
    `<strong>${escape(c.name)}</strong>`,
    c.address ? `<span>${escape(c.address)}</span>` : '',
    c.minPrice != null ? `<span>From ${escape(peso(c.minPrice))} per person</span>` : '',
  ].filter(Boolean).join('')
  return new maplibregl.Marker({ element: el })
    .setLngLat([c.lng, c.lat])
    .setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setHTML(`<div class="other-caterer-popup">${details}</div>`))
}

/**
 * The administrator's map of every approved caterer (logo pins), drawn on a 3D globe:
 * it opens in space and flies down to Biliran. Zoomed out it is a round Earth; zoomed in, a street map.
 * A caterer appears only after it is approved and has pinned its business location.
 */
export function CaterersMap() {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const framed = useRef<FramedMap | null>(null)
  const dark = useMapDark()
  const firstStyle = useRef(dark)
  const [count, setCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!box.current || !key) return
    const map = new maplibregl.Map({
      container: box.current,
      style: styleUrl(firstStyle.current),
      center: SPACE.center,
      zoom: SPACE.zoom,
      scrollZoom: false,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    // The full-screen frame resizes the map and turns wheel zoom on/off through this adapter.
    framed.current = {
      invalidateSize: () => map.resize(),
      scrollWheelZoom: { enabled: () => map.scrollZoom.isEnabled(), enable: () => map.scrollZoom.enable(), disable: () => map.scrollZoom.disable() },
    }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right')
    // Globe projection (re-applied whenever the light/dark style is swapped).
    map.on('style.load', () => map.setProjection({ type: 'globe' }))
    map.on('error', event => { if (/style|Unauthorized|403/i.test(String(event.error?.message ?? ''))) setFailed(true) })

    let gone = false
    const markers: maplibregl.Marker[] = []
    map.once('load', async () => {
      const list = await approvedCaterers({ fresh: true })
      if (gone) return
      setCount(list.length)
      for (const c of list) markers.push(pin(c).addTo(map))
      // From space down to Biliran, framing every caterer.
      const bounds = new maplibregl.LngLatBounds(BILIRAN[0], BILIRAN[1])
      if (list.length > 1) { const pins = new maplibregl.LngLatBounds(); list.forEach(c => pins.extend([c.lng, c.lat])); bounds.setNorthEast(pins.getNorthEast()).setSouthWest(pins.getSouthWest()) }
      window.setTimeout(() => { if (!gone) map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 5000, essential: true }) }, 600)
    })
    return () => { gone = true; markers.forEach(m => m.remove()); map.remove(); mapRef.current = null; framed.current = null }
  }, [])

  // Light / dark switch on the frame.
  useEffect(() => {
    const map = mapRef.current
    if (!map || dark === firstStyle.current && !map.isStyleLoaded()) return
    map.setStyle(styleUrl(dark))
  }, [dark])

  function toggleGlobe() {
    const map = mapRef.current
    if (!map) return
    if (map.getZoom() > 3) map.flyTo({ ...SPACE, duration: 3000, essential: true })
    else map.fitBounds(BILIRAN, { padding: 50, duration: 3500, essential: true })
  }

  if (!key) return <p className="muted-note">Map not configured (VITE_MAPTILER_KEY).</p>
  return (
    <>
      <MapFrame map={framed}>
        <div ref={box} className="event-map-canvas caterers-map-canvas globe-canvas" role="region" aria-label="Globe map of approved caterers" />
        <button type="button" className="globe-toggle" onClick={toggleGlobe} title="Zoom out to the globe, or back to Biliran">
          <GlobeHemisphereEast size={16} weight="bold" /> Globe / Biliran
        </button>
      </MapFrame>
      <p className="muted-note caterers-map-note">
        {failed ? 'The map could not load (check the MapTiler key). ' : ''}
        {count === null ? 'Loading caterers…' : `${count} approved caterer${count === 1 ? '' : 's'} on the map. Click a logo for details.`}
        {' '}Zoom out to see the globe. A caterer appears here after you approve it and it pins its location in Business profile.
      </p>
    </>
  )
}
