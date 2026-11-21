import { useEffect, useState } from 'react'
import L from 'leaflet'
import { db, publicImageUrl } from '../lib/supabase'
import { peso } from '../lib/format'

/**
 * Other approved caterers as pins on the owner's maps (only those that pinned their location).
 * Shown or hidden on every map at once; the choice is remembered in this browser.
 * Uses only what customers can already see: approved, active caterers (database rules decide).
 */
type Caterer = { id: string; name: string; address: string | null; minPrice: number | null; logo: string | null; lat: number; lng: number }

const STORAGE = 'cuisina-map-others'
let show = (() => { try { return localStorage.getItem(STORAGE) !== '0' } catch { return true } })()
const layers = new Map<L.Map, L.LayerGroup>()
const listeners = new Set<(show: boolean) => void>()
let loading: Promise<Caterer[]> | null = null

async function load(): Promise<Caterer[]> {
  const client = db()
  const { data: session } = await client.auth.getSession()
  const me = session.session?.user.id
  const [places, listings] = await Promise.all([
    client.from('catering_businesses').select('id,owner_id,location_lat,location_lng')
      .eq('verification_status', 'approved').not('location_lat', 'is', null).not('location_lng', 'is', null),
    client.from('marketplace_listings').select('id,business_name,address,min_price,logo_path'),
  ])
  if (places.error) throw places.error
  if (listings.error) throw listings.error
  const info = new Map((listings.data ?? []).map(row => [row.id as string, row]))
  return (places.data ?? [])
    .filter(row => row.owner_id !== me && info.has(row.id))
    .map(row => {
      const listing = info.get(row.id)!
      return {
        id: row.id, name: listing.business_name, address: listing.address, minPrice: listing.min_price,
        logo: publicImageUrl(listing.logo_path), lat: Number(row.location_lat), lng: Number(row.location_lng),
      }
    })
}

function caterers(): Promise<Caterer[]> {
  // Loaded once per page; a failed load is retried the next time a map opens.
  loading ??= load().catch(error => { loading = null; console.warn('Could not load other caterers', error); return [] })
  return loading
}

const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

/** "MIKE's Cater" -> MC: first letter of the first two words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(word => /[A-Za-z0-9]/.test(word))
  return words.slice(0, 2).map(word => word.match(/[A-Za-z0-9]/)![0].toUpperCase()).join('') || '?'
}

function marker(c: Caterer): L.Marker {
  const face = c.logo
    ? `<img src="${escape(c.logo)}" alt="" />`
    : `<span>${escape(initials(c.name))}</span>`
  const icon = L.divIcon({ className: 'other-caterer-pin', html: face, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16] })
  const details = [
    `<strong>${escape(c.name)}</strong>`,
    c.address ? `<span>${escape(c.address)}</span>` : '',
    c.minPrice != null ? `<span>From ${escape(peso(c.minPrice))} per person</span>` : '',
  ].filter(Boolean).join('')
  return L.marker([c.lat, c.lng], { icon, title: c.name, keyboard: true, zIndexOffset: -100 })
    .bindTooltip(c.name, { direction: 'top', offset: [0, -16] })
    .bindPopup(`<div class="other-caterer-popup">${details}</div>`)
}

/**
 * Adds the other caterers' pins to a map; they follow the show/hide switch.
 * `always`: shown no matter the switch (the administrator's map). `fresh`: reload the list
 * first (so a caterer approved a moment ago appears). Resolves with the number of pins.
 */
export function addOtherCaterers(map: L.Map, options: { always?: boolean; fresh?: boolean } = {}): Promise<number> {
  const group = L.layerGroup()
  if (options.always) group.addTo(map)
  else {
    layers.set(map, group)
    if (show) group.addTo(map)
  }
  let gone = false
  map.on('unload', () => { gone = true; layers.delete(map) })
  if (options.fresh) loading = null
  return caterers().then(list => {
    if (gone) return 0
    for (const c of list) marker(c).addTo(group)
    return list.length
  })
}

/** Every approved caterer with a pin (logo, name, address, price), for maps that draw their own pins. */
export function approvedCaterers(options: { fresh?: boolean } = {}): Promise<Caterer[]> {
  if (options.fresh) loading = null
  return caterers()
}
export type { Caterer as MapCaterer }

/** Where every approved caterer with a pin is, for fitting a map to all of them. */
export async function catererPoints(): Promise<[number, number][]> {
  return (await caterers()).map(c => [c.lat, c.lng])
}

export function setShowOthers(value: boolean) {
  show = value
  try { localStorage.setItem(STORAGE, value ? '1' : '0') } catch { /* private window: keep it for this page only */ }
  for (const [map, group] of layers) {
    if (value) group.addTo(map)
    else group.remove()
  }
  for (const listener of listeners) listener(value)
}

/** Whether other caterers are shown; re-renders when it changes. */
export function useShowOthers(): boolean {
  const [value, setValue] = useState(show)
  useEffect(() => {
    listeners.add(setValue)
    setValue(show)
    return () => { listeners.delete(setValue) }
  }, [])
  return value
}
