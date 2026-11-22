import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorBanner, StatusBadge } from '../../components/Brand'
import { Avatar } from '../../components/Charts'
import { ChangeRequestsBanner } from '../../components/ChangeRequestsBanner'
import { ConfirmDialog } from '../../components/Dialog'
import { ReportProblemDialog } from '../../components/ReportProblem'
import type { ReportCategory } from '../../components/ReportProblem'
import { useAuth } from '../../lib/auth'
import { bookingNumbers, formatDate, formatTime, peso } from '../../lib/format'
import { fetchCommissionRates, formatRate, splitTotal } from '../../lib/commission'
import { expireStaleBookings, fetchMyBusiness } from '../../lib/owner'
import { db, errorMessage } from '../../lib/supabase'
import type { BookingStatus } from '../../lib/types'
import { EventMap } from '../../components/EventMap'
import { useQuery } from '../../lib/useQuery'
import { toast, useToastMessage } from '../../lib/toast'

type CustomerInfo = {
  customer_id: string
  email: string
  member_since: string
  total_bookings: number
  completed_bookings: number
  cancelled_by_customer: number
}

type BookingRow = {
  id: string
  customer_id: string
  event_date: string
  event_time: string
  location: string
  event_lat: number | null
  event_lng: number | null
  event_barangay: string | null
  event_municipality: string | null
  guest_count: number
  requirements: string | null
  status: BookingStatus
  rejection_reason: string | null
  created_at: string
  package: { name: string; price: number } | null
  price_per_person: number | null
  total_price: number | null
  menu_selection: { course: string; dishes: string[] }[]
  addons: { name: string; amount: number; pricing_type: string }[]
  substitutions: { dish: string; request: string }[]
  owner_proposal: { note: string; proposed_total: number | null; proposed_at: string; status: 'open' | 'accepted' | 'declined' | 'expired' } | null
  category: { name: string } | null
  customer: { full_name: string; phone: string | null } | null
  custom_decoration: DecorationIdeaData | null
}

type DecorationIdeaData = { description: string; photos: string[] }

/** Food, pax, add-ons and notes of a booking (migration 031 snapshots). */
type BookingSnapshot = {
  package_name: string | null
  guest_count: number
  price_per_person: number
  menu_selection: { course: string; dishes: string[] }[]
  addons: { name: string; amount: number }[]
  requirements: string | null
  total: number
}
/** A customer's request to change an accepted booking. */
type ChangeRequest = {
  id: string; booking_id: string; customer_id: string; status: 'open' | 'approved' | 'rejected' | 'cancelled'
  note: string | null; reject_reason: string | null; decided_by: string | null; decided_at: string | null
  current_booking: BookingSnapshot; requested: BookingSnapshot; created_at: string
}
/** An edit saved while the booking was still pending (migration 036). */
type BookingEdit = { id: string; booking_id: string; before_change: BookingSnapshot | null; after_change: BookingSnapshot | null; created_at: string }

/** Same as booking_change_limit() in migration 036. */
const CHANGE_LIMIT = 2

/** One dish, add-on or styling line. `key` says what it is; `text` is how it is shown. */
type Line = { key: string; text: string }
type LineDiff = { added: Line[]; removed: Line[]; changed: { from: Line; to: Line }[] }

/** Compares two lists: what was added, removed, or kept with a different price or quantity. */
function diffLines(before: Line[], after: Line[]): LineDiff {
  // Exact matches first, so a repeated item is never paired with the wrong line.
  const left = [...before]
  const unmatched = after.filter(line => {
    const at = left.findIndex(old => old.key === line.key && old.text === line.text)
    if (at >= 0) left.splice(at, 1)
    return at < 0
  })
  const diff: LineDiff = { added: [], removed: [], changed: [] }
  for (const line of unmatched) {
    const at = left.findIndex(old => old.key === line.key)
    if (at >= 0) diff.changed.push({ from: left.splice(at, 1)[0], to: line })
    else diff.added.push(line)
  }
  diff.removed = left
  return diff
}

const menuLines = (snap: BookingSnapshot): Line[] =>
  (snap.menu_selection ?? []).flatMap(course => course.dishes.map(dish => ({ key: `${course.course}|${dish}`, text: `${course.course}: ${dish}` })))
const addonLines = (snap: BookingSnapshot): Line[] => (snap.addons ?? []).map(addon => ({ key: addon.name, text: `${addon.name} (${peso(addon.amount)})` }))

/** A list inside the full comparison: removed lines crossed out, new lines in green. */
function MarkedLines({ lines, marked, kind, empty }: { lines: Line[]; marked: Line[]; kind: 'added' | 'removed'; empty: string }) {
  if (lines.length === 0) return <>{empty}</>
  return <>{lines.map((line, index) => {
    const isMarked = marked.includes(line)
    return <span key={`${line.key}-${index}`} className={isMarked ? `chg-line ${kind}` : 'chg-line'}>{isMarked && <b aria-hidden="true">{kind === 'added' ? '+' : '−'}</b>}{line.text}</span>
  })}</>
}

/** What changed between two versions of a booking: a summary first, then everything side by side. */
function ChangeSummary({ before, after }: { before: BookingSnapshot; after: BookingSnapshot }) {
  const [full, setFull] = useState(false)
  const lists = [
    { label: 'Menu', before: menuLines(before), after: menuLines(after), empty: '—' },
    { label: 'Add-ons & styling', before: addonLines(before), after: addonLines(after), empty: 'None' },
  ].map(list => ({ ...list, diff: diffLines(list.before, list.after) }))
  const plain: [string, string, string][] = [
    ['Package', before.package_name ?? '—', after.package_name ?? '—'],
    ['Guests', String(before.guest_count), String(after.guest_count)],
    ['Notes', before.requirements || '—', after.requirements || '—'],
  ]
  const changedPlain = plain.filter(([, now, next]) => now !== next)
  const added = lists.flatMap(list => list.diff.added)
  const removed = lists.flatMap(list => list.diff.removed)
  const changed = lists.flatMap(list => list.diff.changed)
  const difference = Number(after.total) - Number(before.total)
  const group = (title: string, kind: string, sign: string, items: Line[]) => items.length > 0 && (
    <div className={`chg-group ${kind}`}>
      <h5><b aria-hidden="true">{sign}</b> {title} <span>{items.length}</span></h5>
      <ul>{items.map((line, index) => <li key={`${line.key}-${index}`}>{line.text}</li>)}</ul>
    </div>
  )
  const plainRow = ([label, now, next]: [string, string, string]) => (
    <tr key={label} className={now !== next ? 'changed' : undefined}><th>{label}</th><td>{now}</td><td>{next}</td></tr>
  )
  return (
    <>
      <div className="chg-summary">
        <div className="chg-total">
          <span>Total</span>
          <strong><s>{peso(before.total)}</s> <i aria-hidden="true">→</i><span className="sr-only"> becomes </span> {peso(after.total)}</strong>
          <em className={difference > 0 ? 'up' : difference < 0 ? 'down' : ''}>
            {difference === 0 ? 'Same price' : `${difference > 0 ? '+' : '−'}${peso(Math.abs(difference))}`}
          </em>
        </div>
        <div className="chg-groups">
          {changedPlain.length > 0 && (
            <div className="chg-group edited">
              <h5><b aria-hidden="true">✎</b> Changed details <span>{changedPlain.length}</span></h5>
              <ul>{changedPlain.map(([label, now, next]) => <li key={label}><strong>{label}:</strong> <s>{now}</s> → {next}</li>)}</ul>
            </div>
          )}
          {group('Added', 'added', '+', added)}
          {group('Removed', 'removed', '−', removed)}
          {changed.length > 0 && (
            <div className="chg-group edited">
              <h5><b aria-hidden="true">✎</b> New price or quantity <span>{changed.length}</span></h5>
              <ul>{changed.map(({ from, to }, index) => <li key={`${to.key}-${index}`}><s>{from.text}</s> → {to.text}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      <button type="button" className="chg-toggle" aria-expanded={full} onClick={() => setFull(value => !value)}>
        {full ? 'Hide full comparison' : 'Show full comparison'}
      </button>
      {full && (
        <table className="chg-table">
          <thead><tr><th /><th>Now</th><th>Requested</th></tr></thead>
          <tbody>
            {plain.slice(0, 2).map(plainRow)}
            {lists.map(list => {
              const { diff } = list
              const isChanged = diff.added.length + diff.removed.length + diff.changed.length > 0
              return (
                <tr key={list.label} className={isChanged ? 'changed' : undefined}>
                  <th>{list.label}</th>
                  <td><MarkedLines lines={list.before} marked={[...diff.removed, ...diff.changed.map(c => c.from)]} kind="removed" empty={list.empty} /></td>
                  <td><MarkedLines lines={list.after} marked={[...diff.added, ...diff.changed.map(c => c.to)]} kind="added" empty={list.empty} /></td>
                </tr>
              )
            })}
            {plain.slice(2).map(plainRow)}
            {plainRow(['Total', peso(before.total), peso(after.total)])}
          </tbody>
        </table>
      )}
    </>
  )
}

/** An unanswered change request, with the answer buttons right below what changed. */
function ChangeRequestView({ request, customer, onAnswer }: { request: ChangeRequest; customer: string; onAnswer: (approve: boolean) => void }) {
  return (
    <section className="bk-callout chg-request">
      <h4>{customer} asks to change this booking <span className="status pending">Waiting for you</span></h4>
      {request.note && <p className="bk-text">“{request.note}”</p>}
      <ChangeSummary before={request.current_booking} after={request.requested} />
      <div className="bk-actions chg-answer">
        <button type="button" className="approve" onClick={() => onAnswer(true)}>Approve changes</button>
        <button type="button" className="reject danger-text" onClick={() => onAnswer(false)}>Reject changes</button>
      </div>
      <p className="muted-note">Sent {formatDate(request.created_at)}. Nothing changes until you approve. If you reject, the customer sees your reason.</p>
    </section>
  )
}

/** Every change the customer already made or asked for on this booking, newest first. */
function ChangeHistory({ requests, edits }: { requests: ChangeRequest[]; edits: BookingEdit[] }) {
  const used = edits.length + requests.filter(request => request.status !== 'cancelled').length
  if (requests.length + edits.length === 0) return null
  const closed = (request: ChangeRequest) => request.decided_by === request.customer_id ? 'Withdrawn by the customer' : 'Closed without an answer'
  const entries = [
    ...edits.map(edit => ({
      id: edit.id, at: edit.created_at, label: 'Edited while pending', tone: 'approved', status: 'Saved',
      before: edit.before_change, after: edit.after_change, note: null as string | null, reason: null as string | null,
    })),
    // The open request has its own card at the top.
    ...requests.filter(request => request.status !== 'open').map(request => ({
      id: request.id, at: request.created_at, label: 'Change request',
      tone: request.status === 'approved' ? 'approved' : request.status === 'rejected' ? 'rejected' : 'suspended',
      status: request.status === 'approved' ? 'Approved' : request.status === 'rejected' ? 'Rejected' : closed(request),
      before: request.current_booking as BookingSnapshot | null, after: request.requested as BookingSnapshot | null,
      note: request.note, reason: request.reject_reason,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <section className="chg-history">
      <h4>Changes by the customer <span className="chg-used">{Math.min(used, CHANGE_LIMIT)} of {CHANGE_LIMIT} used</span></h4>
      {entries.map(entry => (
        <details key={entry.id}>
          <summary><span>{entry.label} <small>{formatDate(entry.at)}</small></span><span className={`status ${entry.tone}`}>{entry.status}</span></summary>
          <div className="chg-entry">
            {entry.note && <p className="bk-text">“{entry.note}”</p>}
            {entry.before && entry.after
              ? <ChangeSummary before={entry.before} after={entry.after} />
              : <p className="muted-note">This edit was made before Cuisina started recording the details.</p>}
            {entry.reason && <p className="bk-text"><b>Your reason:</b> {entry.reason}</p>}
          </div>
        </details>
      ))}
      <p className="muted-note">A customer can change a booking up to {CHANGE_LIMIT} times. Withdrawn requests do not count.</p>
    </section>
  )
}

/** The customer's own decoration idea; photos come from the private bucket through short-lived links. */
function DecorationIdea({ idea }: { idea: DecorationIdeaData }) {
  const [urls, setUrls] = useState<string[]>([])
  const key = idea.photos.join('|')
  useEffect(() => {
    if (!key) return
    let live = true
    void db().storage.from('decoration-ideas').createSignedUrls(key.split('|'), 3600).then(({ data }) => {
      if (live) setUrls((data ?? []).map(item => item.signedUrl).filter((url): url is string => Boolean(url)))
    })
    return () => { live = false }
  }, [key])
  return (
    <section className="bk-callout">
      <h4>Customer's own decoration idea</h4>
      <p className="bk-text">{idea.description}</p>
      {urls.length > 0 && (
        <div className="decor-photos">{urls.map(url => (
          <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Decoration inspiration from the customer" /></a>
        ))}</div>
      )}
      <p className="muted-note">Not included in the total. Use <b>Suggest changes</b> to send the customer your price for it.</p>
    </section>
  )
}

const FILTERS: ('all' | BookingStatus)[] = ['all', 'pending', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled']

type Action = { booking: BookingRow; status: BookingStatus; title: string; needsReason: boolean; danger?: boolean }

/** The All tab groups bookings into these sections; each shows SECTION_PREVIEW rows, then "View more". */
const GROUPS: { key: string; title: string; note: string; statuses: BookingStatus[] }[] = [
  { key: 'active', title: 'In progress', note: 'Pending, accepted and ongoing', statuses: ['pending', 'accepted', 'in_progress'] },
  { key: 'completed', title: 'Completed', note: 'Finished events', statuses: ['completed'] },
  { key: 'cancelled', title: 'Cancelled', note: 'Cancelled or rejected', statuses: ['cancelled', 'rejected'] },
]
const SECTION_PREVIEW = 4

/** The confirm button names the action instead of a generic "Confirm". */
const ACTION_LABELS: Partial<Record<BookingStatus, string>> = {
  accepted: 'Accept booking',
  rejected: 'Reject booking',
  in_progress: 'Start event',
  completed: 'Mark completed',
  cancelled: 'Cancel booking',
}

export default function Bookings() {
  const { userId } = useAuth()
  const { data, loading, error, reload } = useQuery(async () => {
    await expireStaleBookings()
    const business = await fetchMyBusiness(userId!)
    if (!business) return null
    const { data: rows, error: loadError } = await db().from('bookings')
      .select('id,customer_id,event_date,event_time,location,event_lat,event_lng,event_barangay,event_municipality,guest_count,requirements,status,rejection_reason,created_at,price_per_person,total_price,menu_selection,addons,substitutions,owner_proposal,custom_decoration,package:catering_packages(name,price),category:event_categories(name),customer:profiles!bookings_customer_profile_fkey(full_name,phone)')
      // Latest event date first (Nov 24 above Nov 21 above Nov 18); same day: latest change first.
      .eq('business_id', business.id).order('event_date', { ascending: false }).order('updated_at', { ascending: false })
    if (loadError) throw loadError
    const { data: infoRows, error: infoError } = await db().rpc('owner_customer_info')
    if (infoError) throw infoError
    const info: Record<string, CustomerInfo> = {}
    for (const row of (infoRows ?? []) as CustomerInfo[]) info[row.customer_id] = row
    // UNMARSHALLING: Supabase already parsed the JSON; this cast tells TypeScript the rows are BookingRow objects.
    // The caterer's pinned location (migration 022), for the route on each booking's map.
    // Optional: an error (e.g. migration not run yet) just means no route is drawn.
    const { data: place } = await db().from('catering_businesses').select('location_lat,location_lng').eq('id', business.id).maybeSingle()
    const home = place?.location_lat != null && place?.location_lng != null
      ? { lat: Number(place.location_lat), lng: Number(place.location_lng), label: business.business_name }
      : null
    // Customers this caterer blocked (migration 027). null = the block list is not available yet.
    const { data: blockRows, error: blockError } = await db().from('business_blocked_customers').select('customer_id').eq('business_id', business.id)
    const blocked = blockError ? null : new Set((blockRows ?? []).map(row => row.customer_id as string))
    // Cuisina's commission rate on each booking (migration 029). Empty = not available yet: the fee is hidden.
    const rates = await fetchCommissionRates(business.id)
    // Change requests (migration 031) and edits of pending bookings (migration 036).
    // An error (migration not run yet) means none.
    const [{ data: requestRows }, { data: editRows }] = await Promise.all([
      db().from('booking_change_requests')
        .select('id,booking_id,customer_id,status,note,reject_reason,decided_by,decided_at,current_booking,requested,created_at').eq('business_id', business.id),
      db().from('booking_edits').select('id,booking_id,before_change,after_change,created_at').eq('business_id', business.id),
    ])
    const requests = new Map<string, ChangeRequest[]>()
    for (const row of (requestRows ?? []) as ChangeRequest[]) requests.set(row.booking_id, [...(requests.get(row.booking_id) ?? []), row])
    const edits = new Map<string, BookingEdit[]>()
    for (const row of (editRows ?? []) as BookingEdit[]) edits.set(row.booking_id, [...(edits.get(row.booking_id) ?? []), row])
    // The unanswered request of each booking (at most one).
    const changes = new Map(((requestRows ?? []) as ChangeRequest[]).filter(row => row.status === 'open').map(row => [row.booking_id, row]))
    return { business, bookings: rows as unknown as BookingRow[], info, home, blocked, rates, changes, requests, edits }
  }, [userId])

  // null = automatic: pending when there are requests waiting, otherwise all.
  const [filter, setFilter] = useState<'all' | BookingStatus | null>(null)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [problem, setProblem] = useToastMessage('error')
  const [suggest, setSuggest] = useState<BookingRow | null>(null)
  const [reporting, setReporting] = useState<{ booking: BookingRow; category?: ReportCategory } | null>(null)
  const [blocking, setBlocking] = useState<{ booking: BookingRow; block: boolean } | null>(null)
  const [reported, setReported] = useState('')
  const [suggestTotal, setSuggestTotal] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [answering, setAnswering] = useState<{ request: ChangeRequest; booking: BookingRow; approve: boolean } | null>(null)

  // Opened from a notification (/owner/bookings?booking=<id>): show and expand that booking.
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('booking')
  useEffect(() => {
    if (!focusId || !data) return
    if (data.bookings.some(booking => booking.id === focusId)) {
      setFilter('all')
      setSearch('')
      setOpenId(focusId)
      const status = data.bookings.find(booking => booking.id === focusId)?.status
      const group = GROUPS.find(g => status && g.statuses.includes(status))
      if (group) setExpanded(current => ({ ...current, [group.key]: true }))
      setTimeout(() => document.getElementById(`booking-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
    setSearchParams({}, { replace: true })
  }, [focusId, data, setSearchParams])

  const businessId = data?.business.id
  useEffect(() => {
    if (!businessId) return
    const client = db()
    const channel = client.channel(`owner-bookings-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `business_id=eq.${businessId}` }, reload)
      .subscribe()
    // Change requests and edits: a separate channel, so a missing table cannot stop the one above.
    const changeChannel = client.channel(`owner-booking-changes-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_change_requests', filter: `business_id=eq.${businessId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_edits', filter: `business_id=eq.${businessId}` }, reload)
      .subscribe()
    return () => { void client.removeChannel(channel); void client.removeChannel(changeChannel) }
  }, [businessId, reload])

  async function run(reason: string) {
    if (!action) return
    setProblem('')
    const { error: rpcError } = await db().rpc('transition_booking', {
      p_booking_id: action.booking.id,
      p_new_status: action.status,
      p_reason: reason || null,
    })
    setAction(null)
    if (rpcError) setProblem(errorMessage(rpcError))
    else toast(`${ACTION_LABELS[action.status]?.replace(/ booking$/, '') ?? 'Updated'}: done. The customer was notified.`)
    reload()
  }

  async function sendSuggestion(note: string) {
    if (!suggest) return
    setProblem('')
    const { error: rpcError } = await db().rpc('propose_booking_changes', {
      p_booking_id: suggest.id,
      p_note: note,
      p_proposed_total: suggestTotal.trim() ? Number(suggestTotal) : null,
    })
    setSuggest(null); setSuggestTotal('')
    if (rpcError) setProblem(errorMessage(rpcError))
    else toast('Suggestion sent to the customer.')
    reload()
  }

  // Approve (the booking is updated) or reject (the reason is shown to the customer) a change request.
  async function answerChange(reason: string) {
    if (!answering) return
    setProblem('')
    const { error: rpcError } = await db().rpc('respond_change_request', {
      p_request_id: answering.request.id,
      p_approve: answering.approve,
      p_reason: answering.approve ? null : reason,
    })
    setAnswering(null)
    if (rpcError) setProblem(errorMessage(rpcError))
    else toast(answering.approve ? 'Changes approved. The booking is updated.' : 'Changes rejected. The customer sees your reason.')
    reload()
  }

  // Block (only this business; the customer can still book other caterers) or unblock.
  async function changeBlock(reason: string) {
    if (!blocking || !data) return
    setProblem('')
    const { booking, block } = blocking
    const { error: blockError } = block
      ? await db().from('business_blocked_customers').insert({ business_id: data.business.id, customer_id: booking.customer_id, reason: reason.trim() || null })
      : await db().from('business_blocked_customers').delete().eq('business_id', data.business.id).eq('customer_id', booking.customer_id)
    setBlocking(null)
    if (blockError) setProblem(errorMessage(blockError))
    else toast(block ? 'Customer blocked from your business.' : 'Customer unblocked.')
    reload()
  }

  if (loading && !data) return <EmptyState title="Loading bookings…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return <EmptyState title="Create your business profile first">Booking requests arrive once your business is approved.</EmptyState>

  const counts = (status: BookingStatus) => data.bookings.filter(booking => booking.status === status).length
  const activeFilter = filter ?? (counts('pending') > 0 ? 'pending' : 'all')
  const needle = search.trim().toLowerCase()
  const visible = data.bookings
    .filter(booking => activeFilter === 'all' || booking.status === activeFilter)
    .filter(booking => !needle || [booking.customer?.full_name, booking.package?.name, booking.location, booking.customer?.phone]
      .some(value => value?.toLowerCase().includes(needle)))
  const numbers = bookingNumbers(data.bookings)
  const ask = (booking: BookingRow, status: BookingStatus, title: string, needsReason = false, danger = false) => setAction({ booking, status, title, needsReason, danger })

  // One booking row with its expandable detail (shared by the plain list and the All-tab sections).
  const renderItem = (booking: BookingRow) => {
      const open = openId === booking.id
      const name = booking.customer?.full_name || 'Customer'
      return (
        <div key={booking.id} id={`booking-${booking.id}`} className={`bk-item${open ? ' open' : ''}`}>
          <button type="button" className="bk-row" aria-expanded={open} onClick={() => setOpenId(open ? null : booking.id)}>
            <span className="person"><Avatar name={name} /><span><strong>{name}{data.blocked?.has(booking.customer_id) && <span className="status suspended blocked-tag">Blocked</span>}</strong><small>{booking.package?.name ?? 'Package'}{booking.category ? ` · ${booking.category.name}` : ''}</small></span></span>
            <span className="bk-cell" data-label="Event date">{formatDate(booking.event_date)}<small>{formatTime(booking.event_time)}</small></span>
            <span className="bk-cell" data-label="Guests">{booking.guest_count}</span>
            <span className="bk-cell bk-total" data-label="Total">{peso(booking.total_price)}</span>
            <span className="bk-cell"><StatusBadge status={booking.status} />{booking.status === 'pending' && <HoldNotice booking={booking} short />}{data.changes.has(booking.id) && <span className="chg-tag">Change request</span>}{booking.status === 'pending' && data.edits.has(booking.id) && <span className="chg-tag edited">Edited</span>}</span>
            <svg className="chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {open && (
            <div className="bk-detail">
              <div className="bk-main">
                {/* Waiting for an answer: first, so it is never missed below the map and menu. */}
                {data.changes.has(booking.id) && (
                  <ChangeRequestView request={data.changes.get(booking.id)!} customer={name}
                    onAnswer={approve => setAnswering({ request: data.changes.get(booking.id)!, booking, approve })} />
                )}
                <section>
                  <h4>Event</h4>
                  <dl className="bk-facts">
                    <div><dt>When</dt><dd>{formatDate(booking.event_date)}, {formatTime(booking.event_time)}</dd></div>
                    <div><dt>Where</dt><dd>{booking.location}</dd></div>
                    <div><dt>Guests</dt><dd>{booking.guest_count}</dd></div>
                    <div><dt>Booking no.</dt><dd>{numbers.get(booking.id)}</dd></div>
                    <div><dt>Requested</dt><dd>{formatDate(booking.created_at)}</dd></div>
                  </dl>
                  {booking.event_lat != null && booking.event_lng != null && (
                    <EventMap lat={booking.event_lat} lng={booking.event_lng} from={data.home}
                      label={booking.event_barangay ? `Brgy. ${booking.event_barangay}, ${booking.event_municipality ?? ''}` : booking.location} />
                  )}
                </section>
                {booking.menu_selection.length > 0 && (
                  <section>
                    <h4>Menu</h4>
                    <dl className="bk-menu">{booking.menu_selection.map(course => (
                      <div key={course.course}><dt>{course.course}</dt><dd>{course.dishes.join(', ')}</dd></div>
                    ))}</dl>
                  </section>
                )}
                <section>
                  <h4>Price</h4>
                  <ul className="bk-lines">
                    <li><span>{booking.package?.name ?? 'Package'} <small>{peso(booking.price_per_person ?? booking.package?.price)} × {booking.guest_count}</small></span><span>{peso((booking.price_per_person ?? booking.package?.price ?? 0) * booking.guest_count)}</span></li>
                    {booking.addons.map((addon, index) => <li key={`${addon.name}-${index}`}><span>{addon.name}</span><span>{peso(addon.amount)}</span></li>)}
                    {booking.custom_decoration && <li><span>Customer's own decoration</span><span>To be quoted</span></li>}
                    <li className="bk-sum"><span>Total</span><span>{peso(booking.total_price)}</span></li>
                    {data.rates.has(booking.id) && (() => {
                      const rate = data.rates.get(booking.id)!
                      const { fee, receives } = splitTotal(booking.total_price, rate)
                      return <>
                        <li className="bk-fee"><span>Cuisina fee ({formatRate(rate)})</span><span>− {peso(fee)}</span></li>
                        <li className="bk-receive"><span>You receive</span><span>{peso(receives)}</span></li>
                        <li className="bk-fee-note"><span>{booking.status === 'completed' ? 'The fee applies because this event is completed.' : 'The fee applies only when the event is completed.'}</span></li>
                      </>
                    })()}
                  </ul>
                </section>
                {booking.custom_decoration && <DecorationIdea idea={booking.custom_decoration} />}
                {(booking.requirements || booking.substitutions.length > 0) && (
                  <section>
                    <h4>Customer notes</h4>
                    {booking.requirements && <p className="bk-text">{booking.requirements}</p>}
                    {booking.substitutions.map((item, index) => <p key={index} className="bk-text"><b>Swap{item.dish ? ` ${item.dish}` : ''}:</b> {item.request}</p>)}
                  </section>
                )}
                {booking.owner_proposal && (
                  <section className="bk-callout">
                    <h4>Your suggestion <span className={`status ${booking.owner_proposal.status === 'accepted' ? 'approved' : booking.owner_proposal.status === 'declined' ? 'rejected' : 'pending'}`}>{booking.owner_proposal.status === 'open' ? 'Waiting for customer' : booking.owner_proposal.status}</span></h4>
                    <p className="bk-text">{booking.owner_proposal.note}</p>
                    {booking.owner_proposal.proposed_total != null && <p className="bk-text">Proposed total: <b>{peso(booking.owner_proposal.proposed_total)}</b></p>}
                  </section>
                )}
                {booking.rejection_reason && <section><h4>Reason</h4><p className="bk-text">{booking.rejection_reason}</p></section>}
                <ChangeHistory requests={data.requests.get(booking.id) ?? []} edits={data.edits.get(booking.id) ?? []} />
              </div>
              <aside className="bk-side">
                <CustomerCheck customer={booking.customer} info={data.info[booking.customer_id]} />
                {booking.status === 'pending' && <HoldNotice booking={booking} />}
                {['pending', 'accepted', 'in_progress'].includes(booking.status) && (
                  <div className="bk-actions">
                    {booking.status === 'pending' && <>
                      <button className="approve" onClick={() => ask(booking, 'accepted', 'Accept this booking?')}>Accept booking</button>
                      {booking.owner_proposal?.status !== 'open' && <button className="reject" onClick={() => { setSuggestTotal(''); setSuggest(booking) }}>Suggest changes</button>}
                      <button className="reject danger-text" onClick={() => ask(booking, 'rejected', 'Reject this booking?', true, true)}>Reject</button>
                    </>}
                    {booking.status === 'accepted' && <>
                      <button className="approve" onClick={() => ask(booking, 'in_progress', 'Mark this event as in progress?')}>Start event</button>
                      <button className="reject danger-text" onClick={() => ask(booking, 'cancelled', 'Cancel this booking?', true, true)}>Cancel booking</button>
                    </>}
                    {booking.status === 'in_progress' && <>
                      <button className="approve" onClick={() => ask(booking, 'completed', 'Mark this booking as completed?')}>Mark completed</button>
                      {/* No cancelling once the event is in progress (migration 035). */}
                      <span className="bk-locked">The event is in progress, so it can no longer be cancelled.</span>
                    </>}
                  </div>
                )}
                {/* Any booking, any status: tell the administrator about a problem with it. */}
                <button type="button" className="report-link" onClick={() => { setReported(''); setReporting({ booking }) }}>Report a problem with this booking</button>
                {reported === booking.id && <p className="form-success">Sent. The administrator will reply in Notifications and in Help &amp; support.</p>}
                {/* This customer: block from this business only, or ask the administrator to deactivate the account. */}
                <div className="bk-customer-tools">
                  <h4>This customer</h4>
                  {data.blocked && (data.blocked.has(booking.customer_id) ? <>
                    <p className="muted-note">Blocked: they cannot send you new booking requests. Other caterers are not affected.</p>
                    <button className="reject" onClick={() => setBlocking({ booking, block: false })}>Unblock customer</button>
                  </> : (
                    <button className="reject danger-text" onClick={() => setBlocking({ booking, block: true })}>Block from my business</button>
                  ))}
                  <button type="button" className="report-link" onClick={() => { setReported(''); setReporting({ booking, category: 'deactivation' }) }}>Ask the administrator to deactivate this customer</button>
                </div>
              </aside>
            </div>
          )}
        </div>
      )
  }
  const list = (rows: BookingRow[]) => (
    <div className="admin-card bk-list">
      <div className="bk-head" aria-hidden="true"><span>Customer</span><span>Event date</span><span>Guests</span><span>Total</span><span>Status</span><span /></div>
      {rows.map(renderItem)}
    </div>
  )

  return (
    <>
      <ErrorBanner message={problem} />
      <ChangeRequestsBanner refreshKey={[...data.changes.values()].map(request => request.id).sort().join()} />
      <div className="bk-toolbar">
        <div className="bk-tabs" role="tablist" aria-label="Filter bookings by status">
          {FILTERS.map(option => {
            const count = option === 'all' ? data.bookings.length : counts(option)
            return (
              <button key={option} role="tab" aria-selected={activeFilter === option} className={activeFilter === option ? 'active' : ''}
                onClick={() => { setFilter(option); setOpenId(null) }}>
                {option === 'all' ? 'All' : option === 'in_progress' ? 'In progress' : option[0].toUpperCase() + option.slice(1)}
                {count > 0 && <span>{count}</span>}
              </button>
            )
          })}
        </div>
        <input className="bk-search" type="search" placeholder="Search customer, package or place" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search bookings" />
      </div>

      {visible.length === 0 ? (
        <EmptyState title={needle ? 'No matches' : activeFilter === 'pending' ? 'No requests waiting' : 'No bookings here'}>
          {needle ? 'Try a different name or place.' : activeFilter === 'pending' ? 'New requests from customers will show up here.' : 'Nothing matches this filter yet.'}
        </EmptyState>
      ) : activeFilter === 'all' ? (
        <div className="bk-sections">
          {GROUPS.map(group => {
            const rows = visible.filter(booking => group.statuses.includes(booking.status))
            const showAll = Boolean(expanded[group.key])
            return (
              <section key={group.key} className={`bk-section ${group.key}`}>
                <header>
                  <div><h3>{group.title}</h3><p>{group.note}</p></div>
                  <span className="bk-section-count">{rows.length}</span>
                </header>
                {rows.length === 0
                  ? <p className="bk-section-empty">No {group.title.toLowerCase()} bookings.</p>
                  : list(showAll ? rows : rows.slice(0, SECTION_PREVIEW))}
                {rows.length > SECTION_PREVIEW && (
                  <button type="button" className="bk-more" onClick={() => setExpanded(current => ({ ...current, [group.key]: !showAll }))}>
                    {showAll ? 'Show less' : `View more (${rows.length - SECTION_PREVIEW})`}
                  </button>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        list(visible)
      )}
      {suggest && (
        <ConfirmDialog
          title="Suggest changes"
          description={`${suggest.customer?.full_name || 'The customer'} can accept or decline your suggestion. If they accept, the booking becomes accepted.`}
          confirmLabel="Send suggestion"
          inputLabel="What would you like to change? (menu, dishes, guests, price...)"
          inputRequired
          onConfirm={sendSuggestion}
          onCancel={() => setSuggest(null)}
        >
          <label>New total price in PHP (optional)<input type="number" min={0} step="0.01" value={suggestTotal} onChange={event => setSuggestTotal(event.target.value)} placeholder={suggest.total_price != null ? `Currently ${suggest.total_price}` : ''} /></label>
        </ConfirmDialog>
      )}
      {reporting && (
        <ReportProblemDialog
          booking={{ id: reporting.booking.id, label: `${numbers.get(reporting.booking.id) ?? ''} (${reporting.booking.customer?.full_name || 'customer'}, ${formatDate(reporting.booking.event_date)})` }}
          initialCategory={reporting.category}
          onClose={() => setReporting(null)}
          onSent={() => setReported(reporting.booking.id)}
        />
      )}
      {blocking && (
        <ConfirmDialog
          title={blocking.block ? `Block ${blocking.booking.customer?.full_name || 'this customer'}?` : `Unblock ${blocking.booking.customer?.full_name || 'this customer'}?`}
          description={blocking.block
            ? 'They will not be able to send YOUR business new booking requests (they see that you are not accepting bookings from their account). They can still book other caterers. Their existing bookings stay as they are. You can unblock them at any time.'
            : 'They will be able to send your business booking requests again.'}
          confirmLabel={blocking.block ? 'Block customer' : 'Unblock customer'}
          inputLabel={blocking.block ? 'Reason (optional; only you and the administrator see it)' : undefined}
          danger={blocking.block}
          onConfirm={changeBlock}
          onCancel={() => setBlocking(null)}
        />
      )}
      {answering && (
        <ConfirmDialog
          title={answering.approve ? 'Approve the customer’s changes?' : 'Reject the customer’s changes?'}
          description={answering.approve
            ? `The booking is updated: ${answering.request.requested.guest_count} guests, new total ${peso(answering.request.requested.total)}. ${answering.booking.customer?.full_name || 'The customer'} will be notified.`
            : `The booking stays as it is (${peso(answering.request.current_booking.total)}). ${answering.booking.customer?.full_name || 'The customer'} will see your reason.`}
          confirmLabel={answering.approve ? 'Approve changes' : 'Reject changes'}
          inputLabel={answering.approve ? undefined : 'Reason (shared with the customer)'}
          inputRequired={!answering.approve}
          danger={!answering.approve}
          onConfirm={answerChange}
          onCancel={() => setAnswering(null)}
        />
      )}
      {action && (
        <ConfirmDialog
          title={action.title}
          description={`${action.booking.customer?.full_name || 'Customer'} · ${formatDate(action.booking.event_date)}, ${formatTime(action.booking.event_time)} · ${action.booking.guest_count} guests · ${peso(action.booking.total_price)}. The customer will be notified.${data.changes.has(action.booking.id) ? ' Note: this customer’s change request has no answer yet. It will be closed without one.' : ''}`}
          confirmLabel={ACTION_LABELS[action.status] ?? 'Confirm'}
          inputLabel={action.needsReason ? 'Reason (shared with the customer)' : undefined}
          inputRequired={action.status === 'rejected'}
          danger={action.danger}
          onConfirm={run}
          onCancel={() => setAction(null)}
        />
      )}
    </>
  )
}

function CustomerCheck({ customer, info }: { customer: BookingRow['customer']; info?: CustomerInfo }) {
  const days = info ? Math.floor((Date.now() - new Date(info.member_since).getTime()) / 86_400_000) : 0
  const completed = info?.completed_bookings ?? 0
  const cancelled = info?.cancelled_by_customer ?? 0
  // Trusted: has finished events before. Caution: brand-new, no phone, or cancels more than completes.
  const tone = !info || !customer?.phone || (completed === 0 && days < 7) || cancelled > completed ? 'caution' : completed > 0 ? 'ok' : 'neutral'
  const verdict = !customer?.phone
    ? 'No mobile number on file. Confirm details another way before accepting.'
    : tone === 'ok'
      ? `Returning customer with ${completed} completed event${completed === 1 ? '' : 's'}.`
      : tone === 'caution'
        ? 'New or unproven customer. Call to confirm before you accept.'
        : 'No completed events yet. A quick call to confirm is a good idea.'
  return (
    <section className={`bk-customer ${tone}`}>
      <h4>Customer</h4>
      <p className="bk-verdict">{verdict}</p>
      <dl className="bk-facts compact">
        <div><dt>Mobile</dt><dd>{customer?.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : 'Not provided'}</dd></div>
        <div><dt>Email</dt><dd>{info?.email ? <a href={`mailto:${info.email}`}>{info.email}</a> : 'Not available'}</dd></div>
        <div><dt>Member for</dt><dd>{info ? `${days} day${days === 1 ? '' : 's'}` : 'Unknown'}</dd></div>
        <div><dt>History</dt><dd>{info ? `${info.total_bookings} booked, ${completed} completed, ${cancelled} cancelled` : 'Unknown'}</dd></div>
      </dl>
    </section>
  )
}

function HoldNotice({ booking, short = false }: { booking: BookingRow; short?: boolean }) {
  const waitingOnCustomer = booking.owner_proposal?.status === 'open'
  const start = waitingOnCustomer ? booking.owner_proposal!.proposed_at : booking.created_at
  const deadlineDate = new Date(new Date(start).getTime() + 48 * 3_600_000)
  const hoursLeft = Math.floor((deadlineDate.getTime() - Date.now()) / 3_600_000)
  if (short) return <small className="bk-hold">{waitingOnCustomer ? 'Customer deciding' : hoursLeft < 1 ? 'Under 1h left to reply' : `${hoursLeft}h left to reply`}</small>
  const deadline = deadlineDate.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return <p className="bk-deadline">{waitingOnCustomer ? `The customer has until ${deadline} to answer your suggestion.` : `Reply by ${deadline}, or the request expires and the date opens again.`}</p>
}
