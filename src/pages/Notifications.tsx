import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarCheck, CalendarPlus, CalendarX, CaretRight, Checks, Flag, Info, PencilSimpleLine, SealCheck, Storefront } from '@phosphor-icons/react'
import { EmptyState, ErrorBanner } from '../components/Brand'
import { useAuth } from '../lib/auth'
import { formatDate } from '../lib/format'
import { db, errorMessage } from '../lib/supabase'
import { toast } from '../lib/toast'
import { unreadChanged } from '../lib/unread'
import { useQuery } from '../lib/useQuery'

type Notice = {
  id: string
  title: string
  body: string
  is_read: boolean
  created_at: string
  type: string | null
  data: { booking_id?: string; business_id?: string; complaint_id?: string } | null
}

/** Who and what a booking notification is about (loaded with the list). */
type BookingInfo = { customer: string | null; caterer: string | null; packageName: string | null; guests: number | null; eventDate: string | null }

type Portal = 'owner' | 'admin'

/** How many notifications show before "See all". */
const PREVIEW = 10

/** The page a notification opens when clicked, or null when it has nowhere to go. */
function targetFor(portal: Portal, notice: Notice): string | null {
  const bookingId = notice.data?.booking_id
  switch (notice.type) {
    case 'booking_request':
    case 'booking_status':
    case 'booking_proposal':
    case 'booking_change':
      if (portal === 'admin') return '/admin/bookings'
      return bookingId ? `/owner/bookings?booking=${bookingId}` : '/owner/bookings'
    case 'business_verification':
      return portal === 'owner' ? '/owner/business' : '/admin/verification'
    case 'business_application':
      return portal === 'admin' ? '/admin/verification' : null
    case 'complaint_new':
      return portal === 'admin' ? '/admin/complaints' : null
    case 'complaint_update':
      return portal === 'owner' ? '/owner/support' : '/admin/complaints'
    default:
      return null
  }
}

/** The button text on a clickable notification: says what happens next. */
function actionLabel(notice: Notice, portal: Portal): string {
  if (notice.type === 'booking_change' && portal === 'owner' && /change request/i.test(notice.title)) return 'Review changes'
  if (notice.type === 'booking_request' && portal === 'owner') return 'Review booking'
  if (notice.type?.startsWith('booking')) return 'View booking'
  if (notice.type === 'complaint_new') return 'Open report'
  if (notice.type === 'complaint_update') return 'View report'
  if (notice.type === 'business_application') return 'Review application'
  if (notice.type === 'business_verification') return portal === 'owner' ? 'View business' : 'Review application'
  return 'Open'
}

/** A small colored icon per kind of notification, so the list is easy to scan. */
function iconFor(notice: Notice): { icon: ReactNode; tone: string } {
  const title = notice.title.toLowerCase()
  switch (notice.type) {
    case 'booking_request': return { icon: <CalendarPlus size={20} weight="duotone" />, tone: 'gold' }
    case 'booking_change':
    case 'booking_proposal': return { icon: <PencilSimpleLine size={20} weight="duotone" />, tone: 'blue' }
    case 'booking_status':
      return title.includes('cancel') || title.includes('reject')
        ? { icon: <CalendarX size={20} weight="duotone" />, tone: 'red' }
        : { icon: <CalendarCheck size={20} weight="duotone" />, tone: 'green' }
    case 'complaint_new':
    case 'complaint_update': return { icon: <Flag size={20} weight="duotone" />, tone: 'red' }
    case 'business_verification': return { icon: <SealCheck size={20} weight="duotone" />, tone: 'green' }
    case 'business_application': return { icon: <Storefront size={20} weight="duotone" />, tone: 'gold' }
    default: return { icon: <Info size={20} weight="duotone" />, tone: 'gray' }
  }
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const clock = (date: Date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** "Just now", "5 min ago", "3 h ago", "Yesterday, 3:15 PM", "Nov 20, 3:15 PM". */
function whenLabel(iso: string, now: number): string {
  const date = new Date(iso)
  const minutes = Math.floor((now - date.getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const today = startOfDay(new Date(now))
  if (date.getTime() >= today) return `${Math.floor(minutes / 60)} h ago`
  if (date.getTime() >= today - 86400000) return `Yesterday, ${clock(date)}`
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })}, ${clock(date)}`
}

function groupOf(iso: string, now: number): string {
  const today = startOfDay(new Date(now))
  const time = new Date(iso).getTime()
  if (time >= today) return 'Today'
  if (time >= today - 86400000) return 'Yesterday'
  return 'Earlier'
}

/** "Juan Dela Cruz · Feast Package · 50 guests · Nov 27, 2026" */
function detailsLine(info: BookingInfo | undefined, portal: Portal): string | null {
  if (!info) return null
  const who = portal === 'owner' ? info.customer : [info.customer, info.caterer && `with ${info.caterer}`].filter(Boolean).join(' ')
  const parts = [who, info.packageName, info.guests ? `${info.guests} guests` : null, info.eventDate ? formatDate(info.eventDate) : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export default function Notifications() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const portal: Portal = useLocation().pathname.includes('/admin') ? 'admin' : 'owner'
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [showAll, setShowAll] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const { data, loading, error, reload, setData } = useQuery(async () => {
    const [list, unread] = await Promise.all([
      db().from('notifications').select('id,title,body,is_read,created_at,type,data').eq('user_id', userId!).order('created_at', { ascending: false }).limit(100),
      // Counted exactly like the bell, so the two always agree.
      db().from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId!).eq('is_read', false),
    ])
    if (list.error) throw list.error
    const notices = list.data as Notice[]
    // Names and details for booking notifications (optional: the list still shows without them).
    const bookingIds = [...new Set(notices.map(n => n.data?.booking_id).filter((id): id is string => Boolean(id)))]
    const bookings: Record<string, BookingInfo> = {}
    if (bookingIds.length) {
      const { data: rows } = await db().from('bookings')
        .select('id,event_date,guest_count,package:catering_packages(name),customer:profiles!bookings_customer_profile_fkey(full_name),business:catering_businesses(business_name)')
        .in('id', bookingIds)
      for (const row of (rows ?? []) as unknown as { id: string; event_date: string | null; guest_count: number | null; package: { name: string } | null; customer: { full_name: string | null } | null; business: { business_name: string } | null }[]) {
        bookings[row.id] = { customer: row.customer?.full_name ?? null, caterer: row.business?.business_name ?? null, packageName: row.package?.name ?? null, guests: row.guest_count, eventDate: row.event_date }
      }
    }
    return { notices, unread: unread.count ?? notices.filter(n => !n.is_read).length, bookings }
  }, [userId])

  // New, replaced or read notifications (any device): reload and let the bell count again.
  useEffect(() => {
    if (!userId) return
    const client = db()
    const channel = client.channel(`notifications-page-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => { reload(); unreadChanged() })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [userId, reload])

  // Keep "5 min ago" fresh.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  /** Marks notifications read on screen at once (the dot fades), then in the database. */
  function markReadLocally(ids: Set<string> | 'all') {
    setData(current => current && {
      ...current,
      notices: current.notices.map(n => (ids === 'all' || ids.has(n.id) ? { ...n, is_read: true } : n)),
      unread: ids === 'all' ? 0 : Math.max(0, current.unread - current.notices.filter(n => ids.has(n.id) && !n.is_read).length),
    })
  }

  async function markAllRead() {
    markReadLocally('all')
    const { error: updateError } = await db().from('notifications').update({ is_read: true }).eq('user_id', userId!).eq('is_read', false)
    unreadChanged()
    if (updateError) { toast(`Could not mark as read: ${errorMessage(updateError)}`, 'error'); reload(); return }
    toast('All notifications marked as read.')
  }

  // Clicking marks that notification read, then opens the page it is about.
  async function open(notice: Notice) {
    if (!notice.is_read) {
      markReadLocally(new Set([notice.id]))
      await db().from('notifications').update({ is_read: true }).eq('id', notice.id)
      unreadChanged()
    }
    const target = targetFor(portal, notice)
    if (target) navigate(target)
  }

  const all = data?.notices ?? []
  const unread = data?.unread ?? 0
  const filtered = tab === 'unread' ? all.filter(n => !n.is_read) : all
  const shown = showAll ? filtered : filtered.slice(0, PREVIEW)
  const groups = useMemo(() => {
    const result: { label: string; items: Notice[] }[] = []
    for (const notice of shown) {
      const label = groupOf(notice.created_at, now)
      const last = result[result.length - 1]
      if (last?.label === label) last.items.push(notice)
      else result.push({ label, items: [notice] })
    }
    return result
  }, [shown, now])

  if (loading && !data) return <EmptyState title="Loading…" />
  if (error) return <ErrorBanner message={error} />

  let index = 0
  return (
    <>
      <div className="nt-toolbar">
        <div className="nt-tabs" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => { setTab('all'); setShowAll(false) }}>
            All <span>{all.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'unread'} className={tab === 'unread' ? 'active' : ''} onClick={() => { setTab('unread'); setShowAll(false) }}>
            Unread <span className={unread ? 'hot' : ''}>{unread}</span>
          </button>
        </div>
        <button type="button" className="ghost-button nt-markall" disabled={unread === 0} onClick={() => void markAllRead()}>
          <Checks size={16} weight="bold" /> Mark all as read
        </button>
      </div>

      {filtered.length === 0 ? (
        tab === 'unread'
          ? <EmptyState title="No unread notifications">You have read everything. New activity will appear here.</EmptyState>
          : <EmptyState title="You're all caught up">New activity will appear here.</EmptyState>
      ) : (
        <>
          {groups.map(group => (
            <section key={group.label} className="nt-group">
              <h3 className="nt-group-label">{group.label}</h3>
              <ul className="nt-list">{group.items.map(item => {
                const target = targetFor(portal, item)
                const { icon, tone } = iconFor(item)
                const details = detailsLine(item.data?.booking_id ? data?.bookings[item.data.booking_id] : undefined, portal)
                const delay = Math.min(index++, 12) * 35
                return (
                  <li key={item.id} className={`nt-item ${item.is_read ? '' : 'unread'}`} style={{ animationDelay: `${delay}ms` }}>
                    <button type="button" className={`nt-button ${target ? '' : 'static'}`} onClick={() => void open(item)}>
                      <span className={`nt-icon ${tone}`} aria-hidden="true">{icon}</span>
                      <span className="nt-main">
                        <span className="nt-title">
                          <span className="nt-dot" aria-hidden="true" />
                          <strong>{item.title}</strong>
                          {!item.is_read && <span className="nt-new">New</span>}
                        </span>
                        {details && <span className="nt-details">{details}</span>}
                        <span className="nt-body">{item.body}</span>
                      </span>
                      <span className="nt-side">
                        <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()}>{whenLabel(item.created_at, now)}</time>
                        {target && <span className="nt-go">{actionLabel(item, portal)} <CaretRight size={14} weight="bold" aria-hidden="true" /></span>}
                      </span>
                    </button>
                  </li>
                )
              })}</ul>
            </section>
          ))}
          {filtered.length > PREVIEW && (
            <div className="notice-more">
              <button type="button" className="ghost-button" onClick={() => setShowAll(value => !value)}>
                {showAll ? 'Show less' : `See all (${filtered.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
