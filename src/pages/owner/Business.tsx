import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { EmptyState, ErrorBanner, StatusBadge } from '../../components/Brand'
import { LocationPicker } from '../../components/LocationPicker'
import barangayRows from '../../data/biliran_barangays.json'
import type { Point } from '../../components/EventMap'
import { useAuth } from '../../lib/auth'
import { formatDate, safeFileName } from '../../lib/format'
import { fetchMyBusiness } from '../../lib/owner'
import { db, errorMessage, publicImageUrl } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { askConfirm } from '../../components/AskDialog'

type DocumentRow = { id: string; file_path: string; document_type: string; created_at: string }

const DOCUMENT_TYPES = ['Business permit', 'DTI / SEC registration', 'Sanitary permit', 'Valid government ID', 'Other']
const EMPTY = { business_name: '', description: '', address: '', contact_phone: '', contact_email: '', service_area: '', cancellation_policy: '' }

export default function Business() {
  const { userId } = useAuth()
  const { data, loading, error, reload } = useQuery(async () => {
    const business = await fetchMyBusiness(userId!)
    let documents: DocumentRow[] = []
    if (business) {
      const result = await db().from('business_verification_documents').select('id,file_path,document_type,created_at').eq('business_id', business.id).order('created_at', { ascending: false })
      if (result.error) throw result.error
      documents = result.data as DocumentRow[]
    }
    return { business, documents }
  }, [userId])

  const [form, setForm] = useState(EMPTY)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const [docType, setDocType] = useState(DOCUMENT_TYPES[0])

  const business = data?.business ?? null
  useEffect(() => {
    if (business) setForm({
      business_name: business.business_name,
      description: business.description ?? '',
      address: business.address ?? '',
      contact_phone: business.contact_phone ?? '',
      contact_email: business.contact_email ?? '',
      service_area: business.service_area ?? '',
      cancellation_policy: business.cancellation_policy ?? '',
    })
  }, [business])

  function field(name: keyof typeof EMPTY) {
    return { value: form[name], onChange: (event: { target: { value: string } }) => setForm(current => ({ ...current, [name]: event.target.value })) }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setProblem(''); setMessage('')
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]))
      if (business) {
        const { error: updateError } = await db().from('catering_businesses').update(payload).eq('id', business.id)
        if (updateError) throw updateError
        setMessage('Business details saved.')
      } else {
        const { error: insertError } = await db().from('catering_businesses').insert({ ...payload, owner_id: userId })
        if (insertError) throw insertError
        setMessage('Application submitted. Upload your verification documents below.')
      }
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File | undefined) {
    if (!file || !business) return
    if (file.size > 10 * 1024 * 1024) { setProblem('Files must be 10 MB or smaller.'); return }
    setBusy(true); setProblem(''); setMessage('')
    try {
      const path = `${userId}/${Date.now()}-${safeFileName(file.name)}`
      const { error: uploadError } = await db().storage.from('verification-documents').upload(path, file)
      if (uploadError) throw uploadError
      const { error: rowError } = await db().from('business_verification_documents').insert({ business_id: business.id, uploaded_by: userId, file_path: path, document_type: docType })
      if (rowError) {
        await db().storage.from('verification-documents').remove([path])
        throw rowError
      }
      setMessage('Document uploaded.')
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeDocument(doc: DocumentRow) {
    if (!(await askConfirm({ title: 'Remove this document?', description: 'The file will be deleted from your application.', confirmLabel: 'Remove', danger: true }))) return
    setProblem('')
    try {
      const { error: rowError } = await db().from('business_verification_documents').delete().eq('id', doc.id)
      if (rowError) throw rowError
      await db().storage.from('verification-documents').remove([doc.file_path])
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    }
  }

  async function uploadBranding(kind: 'logo' | 'cover', file: File | undefined) {
    if (!file || !business) return
    if (!file.type.startsWith('image/')) { setProblem('Please choose an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setProblem('Images must be 5 MB or smaller.'); return }
    setBusy(true); setProblem(''); setMessage('')
    try {
      const path = `${userId}/branding/${kind}-${Date.now()}-${safeFileName(file.name)}`
      const { error: uploadError } = await db().storage.from('catering-public').upload(path, file)
      if (uploadError) throw uploadError
      const { error: updateError } = await db().from('catering_businesses').update(kind === 'logo' ? { logo_path: path } : { cover_path: path }).eq('id', business.id)
      if (updateError) { await db().storage.from('catering-public').remove([path]); throw updateError }
      const previous = kind === 'logo' ? business.logo_path : business.cover_path
      if (previous) await db().storage.from('catering-public').remove([previous])
      setMessage(kind === 'logo' ? 'Logo updated.' : 'Cover photo updated.')
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function resubmit() {
    setBusy(true); setProblem(''); setMessage('')
    try {
      const { error: rpcError } = await db().rpc('resubmit_business')
      if (rpcError) throw rpcError
      setMessage('Application resubmitted for review.')
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <EmptyState title="Loading…" />

  return (
    <>
      <ErrorBanner message={error || problem} />
      {message && <div className="form-notice" role="status">{message}</div>}
      <div className="two-col">
        <form className="admin-card form-card" onSubmit={save}>
          <div className="card-heading">
            <div><p className="eyebrow">{business ? 'Business profile' : 'New application'}</p><h2>{business ? business.business_name : 'Tell us about your business'}</h2></div>
            {business && <StatusBadge status={business.verification_status} />}
          </div>
          <div className="form-grid">
            <label className="wide">Business name<input required minLength={2} maxLength={150} {...field('business_name')} /></label>
            <label className="wide">Description<textarea rows={4} {...field('description')} placeholder="Cuisine style, specialties, what makes you stand out" /></label>
            <label>Service area<input {...field('service_area')} placeholder="e.g. Metro Manila" /></label>
            <label>Address<input {...field('address')} /></label>
            <label>Contact phone<input type="tel" {...field('contact_phone')} /></label>
            <label>Contact email<input type="email" {...field('contact_email')} /></label>
            <label className="wide">Cancellation policy <small>(shown to customers before they book)</small><textarea rows={3} maxLength={600} {...field('cancellation_policy')} placeholder="e.g. Free cancellation up to 7 days before the event. Deposits are non-refundable within 7 days." /></label>
          </div>
          <div className="form-actions">
            <button className="admin-primary inline" disabled={busy}>{busy ? 'Saving…' : business ? 'Save changes' : 'Submit application'}</button>
            {business?.verification_status === 'rejected' && <button type="button" className="ghost-button" disabled={busy} onClick={() => void resubmit()}>Resubmit for review</button>}
          </div>
          {business?.verification_status === 'rejected' && business.rejection_reason && <div className="form-error">Rejected: {business.rejection_reason}</div>}
        </form>

        {business && <BookingNotice businessId={business.id} />}
        {business && <BusinessLocation businessId={business.id} />}

        <div className="admin-card form-card">
          <div className="card-heading"><div><p className="eyebrow">Branding</p><h2>Logo and cover photo</h2></div></div>
          {!business ? <EmptyState title="Submit your application first">You can add branding once your business profile exists.</EmptyState> : (
            <div className="branding">
              <div className="branding-cover" style={business.cover_path ? { backgroundImage: `url(${publicImageUrl(business.cover_path)})` } : undefined}>
                {!business.cover_path && <span>No cover photo</span>}
              </div>
              <div className="branding-logo">{business.logo_path ? <img src={publicImageUrl(business.logo_path) ?? ''} alt="Business logo" /> : <span>{business.business_name.charAt(0).toUpperCase()}</span>}</div>
              <div className="branding-actions">
                <label className="ghost-button file-button">{business.logo_path ? 'Change logo' : 'Upload logo'}<input type="file" accept="image/*" hidden disabled={busy} onChange={event => { void uploadBranding('logo', event.target.files?.[0]); event.target.value = '' }} /></label>
                <label className="ghost-button file-button">{business.cover_path ? 'Change cover' : 'Upload cover'}<input type="file" accept="image/*" hidden disabled={busy} onChange={event => { void uploadBranding('cover', event.target.files?.[0]); event.target.value = '' }} /></label>
              </div>
            </div>
          )}
        </div>

        <div className="admin-card form-card">
          <div className="card-heading"><div><p className="eyebrow">Verification</p><h2>Documents</h2></div></div>
          {!business ? <EmptyState title="Submit your application first">You can upload documents once your business profile exists.</EmptyState> : (
            <>
              <div className="upload-row">
                <select value={docType} onChange={event => setDocType(event.target.value)} aria-label="Document type">
                  {DOCUMENT_TYPES.map(type => <option key={type}>{type}</option>)}
                </select>
                <input type="file" accept="image/*,application/pdf" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} aria-label="Upload document" />
              </div>
              {data?.documents.length === 0 ? <p className="muted-note">No documents uploaded yet.</p> : (
                <ul className="doc-list">
                  {data?.documents.map(doc => (
                    <li key={doc.id}><div><strong>{doc.document_type}</strong><small>{doc.file_path.split('/').pop()?.replace(/^\d+-/, '')} · {formatDate(doc.created_at)}</small></div><button className="ghost-button" onClick={() => void removeDocument(doc)}>Remove</button></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

/** Official Biliran barangays (PSGC); `center` from OpenStreetMap when known. */
const BARANGAYS = (barangayRows as { c: string; b: string; t: string; y?: number; x?: number }[]).map(row => ({
  code: row.c,
  name: row.b,
  town: row.t,
  label: `${row.b}, ${row.t}`,
  center: row.y != null && row.x != null ? { lat: row.y, lng: row.x } : null,
}))

const TOWN_CENTERS: Record<string, Point> = {
  Almeria: { lat: 11.6203, lng: 124.3817 },
  Biliran: { lat: 11.4666, lng: 124.4741 },
  Cabucgayan: { lat: 11.4730, lng: 124.5750 },
  Caibiran: { lat: 11.5723, lng: 124.5813 },
  Culaba: { lat: 11.6556, lng: 124.5406 },
  Kawayan: { lat: 11.6800, lng: 124.3570 },
  Maripipi: { lat: 11.7765, lng: 124.3486 },
  Naval: { lat: 11.5618, lng: 124.3965 },
}

/** The caterer pins the business on the map; booking maps then show the route to each event. */
function BusinessLocation({ businessId }: { businessId: string }) {
  const saved = useQuery(async () => {
    const { data, error } = await db().from('catering_businesses').select('location_lat,location_lng').eq('id', businessId).maybeSingle()
    if (error) throw error
    const point = data?.location_lat != null && data?.location_lng != null ? { lat: Number(data.location_lat), lng: Number(data.location_lng) } : null
    // The barangay (migration 024) is optional: older databases just don't have it yet.
    const place = await db().from('catering_businesses').select('location_barangay,location_municipality').eq('id', businessId).maybeSingle()
    const label = place.error || !place.data?.location_barangay ? '' : `${place.data.location_barangay}, ${place.data.location_municipality ?? ''}`
    return { point, label, hasBarangayColumns: !place.error }
  }, [businessId])
  const [point, setPoint] = useState<Point | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [search, setSearch] = useState<string | null>(null)
  const [focus, setFocus] = useState<(Point & { zoom: number; at: number }) | null>(null)
  const current = point ?? saved.data?.point ?? null
  const text = search ?? saved.data?.label ?? ''
  const chosen = BARANGAYS.find(b => b.label.toLowerCase() === text.trim().toLowerCase()) ?? null

  // Typing a barangay moves the map there and puts the pin at its center; then click the exact spot.
  function chooseBarangay(value: string) {
    setSearch(value)
    setMessage(''); setProblem('')
    const hit = BARANGAYS.find(b => b.label.toLowerCase() === value.trim().toLowerCase())
    if (!hit) return
    const spot = hit.center ?? TOWN_CENTERS[hit.town]
    if (!spot) return
    setPoint(spot)
    setFocus({ ...spot, zoom: hit.center ? 16 : 14, at: Date.now() })
  }

  // Clicking the map moves the pin. With no barangay chosen yet, suggest the nearest one (editable).
  function pick(spot: Point) {
    setPoint(spot)
    setMessage(''); setProblem('')
    if (!chosen) {
      const nearest = nearestBarangay(spot)
      if (nearest) setSearch(nearest.label)
    }
  }

  const pointChanged = point !== null && (point.lat !== saved.data?.point?.lat || point.lng !== saved.data?.point?.lng)
  const barangayChanged = chosen !== null && chosen.label !== saved.data?.label
  const changed = current !== null && chosen !== null && (pointChanged || barangayChanged)

  async function save() {
    if (!current || !chosen) return
    setBusy(true); setProblem(''); setMessage('')
    try {
      const update: Record<string, unknown> = { location_lat: current.lat, location_lng: current.lng }
      if (saved.data?.hasBarangayColumns) {
        update.location_barangay = chosen.name
        update.location_municipality = chosen.town
      }
      const { error } = await db().from('catering_businesses').update(update).eq('id', businessId)
      if (error) throw error
      setMessage(`Location saved: Brgy. ${chosen.name}, ${chosen.town}. Customers now see you on the map.`)
      setPoint(null); setSearch(null)
      saved.reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-card form-card">
      <div className="card-heading"><div><p className="eyebrow">Location</p><h2>Where is your business?</h2></div></div>
      <p className="muted-note">Type your barangay to jump there, then click the exact spot of your kitchen or office (Biliran only). Customers see your business and barangay on the map, and each booking shows the road route, distance and travel time to the event.</p>
      <label className="location-search">Barangay
        <input list="biliran-barangays" value={text} onChange={event => chooseBarangay(event.target.value)} placeholder="Type your barangay, e.g. Caraycaray" autoComplete="off" />
        <datalist id="biliran-barangays">{BARANGAYS.map(b => <option key={b.code} value={b.label} />)}</datalist>
        {text && !chosen && <small className="muted-note">Choose a barangay from the list.</small>}
      </label>
      {saved.error ? <ErrorBanner message={saved.error} /> : saved.loading && !saved.data && !point ? <p className="muted-note">Loading map…</p> : (
        <LocationPicker value={current} onChange={pick} focus={focus} />
      )}
      <ErrorBanner message={problem} />
      {message && <p className="form-success">{message}</p>}
      <div className="form-actions">
        <button type="button" className="admin-primary inline" disabled={busy || !changed} onClick={() => void save()}>{busy ? 'Saving…' : 'Save location'}</button>
        {current && <small className="muted-note">{chosen ? `Brgy. ${chosen.name}, ${chosen.town} · ` : ''}{current.lat.toFixed(5)}, {current.lng.toFixed(5)}</small>}
      </div>
    </div>
  )
}

/** The barangay whose known center is closest to a point (a suggestion the owner can change). */
function nearestBarangay(spot: Point) {
  let best: (typeof BARANGAYS)[number] | null = null
  let bestKm = Infinity
  for (const b of BARANGAYS) {
    if (!b.center) continue
    const dLat = (b.center.lat - spot.lat) * 111
    const dLng = (b.center.lng - spot.lng) * 111 * Math.cos(spot.lat * Math.PI / 180)
    const km = Math.hypot(dLat, dLng)
    if (km < bestKm) { best = b; bestKm = km }
  }
  return bestKm <= 5 ? best : null
}

/** How many days in advance customers must book (migration 023). At least 1: no same-day bookings. */
function BookingNotice({ businessId }: { businessId: string }) {
  const saved = useQuery(async () => {
    const { data, error } = await db().from('catering_businesses').select('booking_lead_days').eq('id', businessId).maybeSingle()
    if (error) throw error
    return Number(data?.booking_lead_days ?? 1)
  }, [businessId])
  const [days, setDays] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const value = days === '' ? String(saved.data ?? 1) : days
  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 365
  const changed = valid && parsed !== saved.data

  async function save() {
    if (!changed) return
    setBusy(true); setProblem(''); setMessage('')
    try {
      const { error } = await db().from('catering_businesses').update({ booking_lead_days: parsed }).eq('id', businessId)
      if (error) throw error
      setMessage(`Saved. Customers can now book from ${parsed === 1 ? 'tomorrow' : `${parsed} days from today`} onward.`)
      setDays('')
      saved.reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-card form-card">
      <div className="card-heading"><div><p className="eyebrow">Booking rules</p><h2>How far in advance must customers book?</h2></div></div>
      <p className="muted-note">Same-day bookings are never allowed. Earlier dates are greyed out in the customer app, and the system refuses them.</p>
      {saved.error ? <ErrorBanner message={saved.error} /> : (
        <div className="form-grid">
          <label>Minimum notice (days)
            <input type="number" min={1} max={365} step={1} value={value} onChange={event => setDays(event.target.value)} />
            <small className="muted-note">{valid ? `Earliest bookable date: ${parsed === 1 ? 'tomorrow' : `${parsed} days from today`}.` : 'Enter a whole number from 1 to 365.'}</small>
          </label>
        </div>
      )}
      <ErrorBanner message={problem} />
      {message && <p className="form-success">{message}</p>}
      <div className="form-actions">
        <button type="button" className="admin-primary inline" disabled={busy || !changed} onClick={() => void save()}>{busy ? 'Saving…' : 'Save booking rule'}</button>
      </div>
    </div>
  )
}
