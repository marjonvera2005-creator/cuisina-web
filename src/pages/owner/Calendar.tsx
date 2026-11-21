import { useMemo, useState } from 'react'
import { CaretLeft, CaretRight, Info } from '@phosphor-icons/react'
import { EmptyState, ErrorBanner, StatusBadge } from '../../components/Brand'
import { useAuth } from '../../lib/auth'
import { formatDate, formatTime, todayIso } from '../../lib/format'
import { expireStaleBookings, fetchMyBusiness } from '../../lib/owner'
import { db, errorMessage } from '../../lib/supabase'

import { useQuery } from '../../lib/useQuery'
import { toast, useToastMessage } from '../../lib/toast'

const STATUS_ORDER = ['pending', 'accepted', 'in_progress', 'completed']
const STATUS_LABEL: Record<string, string> = { pending: 'Pending', accepted: 'Accepted', in_progress: 'In progress', completed: 'Completed' }

type Entry = {
  id: string
  event_date: string
  event_time: string
  guest_count: number
  status: string
  location: string
  package: { name: string } | null
  customer: { full_name: string } | null
}

type Blocked = { id: string; unavailable_date: string; reason: string | null }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ACTIVE = ['pending', 'accepted', 'in_progress']

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function Calendar() {
  const { userId } = useAuth()
  const { data, loading, error, reload } = useQuery(async () => {
    await expireStaleBookings()
    const business = await fetchMyBusiness(userId!)
    if (!business) return null
    const [bookings, blocked] = await Promise.all([
      db().from('bookings')
        .select('id,event_date,event_time,guest_count,status,location,package:catering_packages(name),customer:profiles!bookings_customer_profile_fkey(full_name)')
        .eq('business_id', business.id).in('status', [...ACTIVE, 'completed']),
      db().from('business_availability').select('id,unavailable_date,reason').eq('business_id', business.id),
    ])
    if (bookings.error) throw bookings.error
    if (blocked.error) throw blocked.error
    return { business, bookings: bookings.data as unknown as Entry[], blocked: blocked.data as Blocked[] }
  }, [userId])

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useToastMessage('error')

  const byDate = useMemo(() => {
    const map: Record<string, Entry[]> = {}
    for (const entry of data?.bookings ?? []) (map[entry.event_date] ??= []).push(entry)
    return map
  }, [data])
  const blockedByDate = useMemo(() => new Map((data?.blocked ?? []).map(item => [item.unavailable_date, item])), [data])

  function shift(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear()); setMonth(next.getMonth()); setSelected(null)
  }

  function pick(key: string) {
    setSelected(key); setReason(''); setProblem('')
  }

  async function markNotAvailable(date: string) {
    if (!data) return
    setBusy(true); setProblem('')
    try {
      const { error: insertError } = await db().from('business_availability')
        .insert({ business_id: data.business.id, unavailable_date: date, reason: reason.trim() || null })
      if (insertError) throw insertError
      setReason('')
      toast('Date marked as not available.')
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function markAvailable(id: string) {
    setBusy(true); setProblem('')
    try {
      const { error: deleteError } = await db().from('business_availability').delete().eq('id', id)
      if (deleteError) throw deleteError
      toast('Date is available again.')
      reload()
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <EmptyState title="Loading calendar…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return <EmptyState title="Create your business profile first">Your calendar shows bookings once your business is set up.</EmptyState>

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leading = new Date(year, month, 1).getDay()
  const today = todayIso()
  const chosen = selected ? byDate[selected] ?? [] : []
  const chosenBlock = selected ? blockedByDate.get(selected) : undefined
  const hasActiveBooking = chosen.some(entry => ACTIVE.includes(entry.status))
  const isPast = selected !== null && selected < today

  return (
    <>
      <div className="admin-card calendar-card">
        <div className="calendar-head cal-head-sides">
          <button type="button" className="cal-nav cal-side" onClick={() => shift(-1)} aria-label="Previous month"><CaretLeft size={18} weight="bold" /></button>
          <div className="cal-title">
            <h2>{MONTHS[month]} <span>{year}</span></h2>
            <p className="calendar-hint"><Info size={14} weight="bold" aria-hidden="true" /> Click a date to see its bookings or to mark it as not available.</p>
            <button type="button" className="cal-today" onClick={() => { const n = new Date(); setYear(n.getFullYear()); setMonth(n.getMonth()); setSelected(null) }}>Today</button>
          </div>
          <button type="button" className="cal-nav cal-side" onClick={() => shift(1)} aria-label="Next month"><CaretRight size={18} weight="bold" /></button>
        </div>
        <div className="calendar-grid">
          {WEEKDAYS.map(day => <div key={day} className="calendar-weekday">{day}</div>)}
          {Array.from({ length: leading }, (_, index) => <div key={`blank-${index}`} className="calendar-blank" />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1
            const key = iso(year, month, day)
            const entries = byDate[key] ?? []
            const blocked = blockedByDate.has(key)
            const weekend = (leading + index) % 7 === 0 || (leading + index) % 7 === 6
            const classes = ['calendar-day', key === today ? 'today' : '', key < today ? 'past' : '', weekend ? 'weekend' : '', blocked ? 'blocked' : '', selected === key ? 'selected' : ''].filter(Boolean).join(' ')
            return (
              <button key={key} className={classes} onClick={() => pick(key)}>
                <span>{day}</span>
                {/* One coloured, labelled chip per status (e.g. "2 Completed"), easy to tell apart. */}
                {STATUS_ORDER.filter(status => entries.some(entry => entry.status === status)).map(status => {
                  const count = entries.filter(entry => entry.status === status).length
                  return <em key={status} className={`cal-chip ${status}`}>{count > 1 ? `${count} ` : ''}{STATUS_LABEL[status]}</em>
                })}
                {blocked && entries.length === 0 && <em className="cal-chip blocked">Not available</em>}
              </button>
            )
          })}
          {Array.from({ length: (7 - ((leading + daysInMonth) % 7)) % 7 }, (_, index) => <div key={`end-${index}`} className="calendar-blank" />)}
        </div>
        <div className="calendar-legend">
          <span><i className="cal-key pending" /> Pending</span>
          <span><i className="cal-key accepted" /> Accepted</span>
          <span><i className="cal-key in_progress" /> In progress</span>
          <span><i className="cal-key completed" /> Completed</span>
          <span><i className="cal-key blocked" /> Not available</span>
        </div>
      </div>

      {selected && (
        <div className="admin-card calendar-detail">
          <div className="card-heading"><div><p className="eyebrow">Selected day</p><h2>{formatDate(selected)}</h2></div></div>
          <ErrorBanner message={problem} />
          {chosen.length === 0
            ? <p className="muted-note padded-note">{chosenBlock ? `You marked this date as not available.${chosenBlock.reason ? ` Reason: ${chosenBlock.reason}` : ''}` : 'No bookings on this day.'}</p>
            : <ul className="doc-list padded">{chosen.map(entry => (
              <li key={entry.id}>
                <div>
                  <strong>{entry.customer?.full_name || 'Customer'} · {entry.package?.name ?? 'Package'}</strong>
                  <small>{formatTime(entry.event_time)} · {entry.guest_count} guests · {entry.location}</small>
                </div>
                <StatusBadge status={entry.status} />
              </li>
            ))}</ul>}

          {!isPast && (
            <div className="calendar-actions">
              {chosenBlock ? (
                <button className="admin-primary inline" disabled={busy} onClick={() => void markAvailable(chosenBlock.id)}>
                  {busy ? 'Saving…' : 'Make available again'}
                </button>
              ) : hasActiveBooking ? (
                <p className="muted-note">This date already has a booking, so it cannot be marked as not available.</p>
              ) : (
                <>
                  <input value={reason} onChange={event => setReason(event.target.value)} maxLength={120} placeholder="Reason (optional, only you see this)" aria-label="Reason" />
                  <button className="admin-primary inline" disabled={busy} onClick={() => void markNotAvailable(selected)}>
                    {busy ? 'Saving…' : 'Mark as not available'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
