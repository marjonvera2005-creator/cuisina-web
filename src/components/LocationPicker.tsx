import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addTiles, BILIRAN_BOUNDS, pin } from './EventMap'
import type { Point } from './EventMap'
import { MapFrame } from './MapFrame'
import { addOtherCaterers } from './otherCaterers'

/** Biliran map where the owner clicks to place (or move) a pin. */
export function LocationPicker({ value, onChange, focus }: { value: Point | null; onChange: (point: Point) => void; focus?: (Point & { zoom: number; at: number }) | null }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.CircleMarker | null>(null)
  const change = useRef(onChange)
  change.current = onChange

  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { maxBounds: BILIRAN_BOUNDS.pad(0.05), minZoom: 10, scrollWheelZoom: true })
    addTiles(m)
    addOtherCaterers(m)
    if (value) m.setView([value.lat, value.lng], 16)
    else m.fitBounds(BILIRAN_BOUNDS)
    m.on('click', event => {
      const { lat, lng } = event.latlng
      if (!BILIRAN_BOUNDS.contains(event.latlng)) return
      change.current({ lat, lng })
    })
    map.current = m
    return () => { m.remove(); map.current = null; marker.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the pin in sync with the chosen value.
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!value) { marker.current?.remove(); marker.current = null; return }
    if (marker.current) marker.current.setLatLng([value.lat, value.lng])
    else marker.current = L.circleMarker([value.lat, value.lng], pin('#263d2b')).addTo(m)
  }, [value?.lat, value?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Move the view when asked (a new `at` each time, so the same place can be shown again).
  useEffect(() => {
    if (focus && map.current) map.current.setView([focus.lat, focus.lng], focus.zoom)
  }, [focus?.at]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MapFrame map={map} others>
      <div ref={box} className="event-map-canvas location-picker-canvas" role="application" aria-label="Click the map to pin your business location" />
    </MapFrame>
  )
}
