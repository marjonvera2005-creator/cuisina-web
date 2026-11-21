import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { MapFrame } from './MapFrame'
import { addTiles } from './mapStyle'
import { addOtherCaterers } from './otherCaterers'

const key = import.meta.env.VITE_MAPTILER_KEY as string | undefined

/** Biliran province (Biliran island and Maripipi), with a little sea around it. */
export const BILIRAN_BOUNDS = L.latLngBounds([11.38, 124.2], [11.86, 124.7])

export { addTiles }

// Plain circle markers avoid Leaflet's image icons, which break under bundlers.
export const pin = (color: string) => ({ radius: 10, color: '#ffffff', weight: 3, fillColor: color, fillOpacity: 1 })

export type Point = { lat: number; lng: number }
type Route = { line: [number, number][]; km: number; minutes: number }

/** Road route between two points (OSRM, OpenStreetMap roads). Null when it cannot be found. */
async function fetchRoute(from: Point, to: Point): Promise<Route | null> {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`)
    if (!res.ok) return null
    const data = await res.json() as { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }
    const route = data.routes?.[0]
    if (data.code !== 'Ok' || !route) return null
    return { line: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]), km: route.distance / 1000, minutes: route.duration / 60 }
  } catch {
    return null
  }
}

/**
 * Read-only map with the customer's event pin. When the caterer's own location is known,
 * it also draws the road route from the caterer to the event, with distance and time.
 */
export function EventMap({ lat, lng, label, from }: { lat: number; lng: number; label: string; from?: (Point & { label: string }) | null }) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [routeState, setRouteState] = useState<'none' | 'loading' | 'road' | 'straight'>('none')

  useEffect(() => {
    if (!box.current || !key) return
    const event: Point = { lat, lng }
    // Stay around Biliran (plus the event and the caterer, wherever they are): no zooming out to a flat,
    // repeating world map. Zoom 9 still shows the whole province.
    const area = L.latLngBounds(BILIRAN_BOUNDS.getSouthWest(), BILIRAN_BOUNDS.getNorthEast()).extend([lat, lng])
    if (from) area.extend([from.lat, from.lng])
    const map = L.map(box.current, { scrollWheelZoom: false, minZoom: 9, maxBounds: area.pad(0.25), maxBoundsViscosity: 0.8 }).setView([lat, lng], 16)
    mapRef.current = map
    addTiles(map)
    addOtherCaterers(map)
    L.circleMarker([lat, lng], pin('#c0392b')).addTo(map).bindTooltip(`Event: ${label}`, { direction: 'top', offset: [0, -10] })

    let cancelled = false
    if (from) {
      L.circleMarker([from.lat, from.lng], pin('#263d2b')).addTo(map).bindTooltip(`Caterer: ${from.label}`, { direction: 'top', offset: [0, -10] })
      map.fitBounds(L.latLngBounds([from.lat, from.lng], [lat, lng]), { padding: [36, 36], maxZoom: 16 })
      setRouteState('loading')
      void fetchRoute(from, event).then(found => {
        if (cancelled) return
        if (found) {
          L.polyline(found.line, { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(map)
          map.fitBounds(L.latLngBounds(found.line), { padding: [36, 36], maxZoom: 16 })
          setRoute(found); setRouteState('road')
        } else {
          // No road route (e.g. the routing service is down): a straight dashed line instead.
          L.polyline([[from.lat, from.lng], [lat, lng]], { color: '#2563eb', weight: 4, dashArray: '8 8' }).addTo(map)
          setRoute(null); setRouteState('straight')
        }
      })
    } else {
      setRoute(null); setRouteState('none')
    }
    return () => { cancelled = true; map.remove(); mapRef.current = null }
  }, [lat, lng, label, from?.lat, from?.lng, from?.label]) // eslint-disable-line react-hooks/exhaustive-deps

  const origin = from ? `&origin=${from.lat},${from.lng}` : ''
  const directions = `https://www.google.com/maps/dir/?api=1${origin}&destination=${lat},${lng}`
  const straightKm = from ? L.latLng(from.lat, from.lng).distanceTo([lat, lng]) / 1000 : 0
  return (
    <div className="event-map">
      {key
        ? <MapFrame map={mapRef} others><div ref={box} className="event-map-canvas" role="img" aria-label={`Map of ${label}`} /></MapFrame>
        : <p className="muted-note">Map not configured (VITE_MAPTILER_KEY).</p>}
      {from && (
        <p className="event-map-route">
          {routeState === 'loading' && 'Finding the road route…'}
          {routeState === 'road' && route && <>From your location: <strong>{route.km.toFixed(1)} km</strong> by road, about <strong>{Math.max(1, Math.round(route.minutes))} min</strong> drive</>}
          {routeState === 'straight' && <>About <strong>{straightKm.toFixed(1)} km</strong> straight-line (road route unavailable right now)</>}
        </p>
      )}
      <div className="event-map-links">
        <a href={directions} target="_blank" rel="noreferrer">Get directions (Google Maps) →</a>
        <small>{lat.toFixed(5)}, {lng.toFixed(5)}</small>
      </div>
      {!from && <p className="muted-note event-map-tip">Tip: pin your business location in Business profile to see the route and distance here.</p>}
    </div>
  )
}
