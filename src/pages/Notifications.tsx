import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { EmptyState, ErrorBanner } from '../components/Brand'
import { useAuth } from '../lib/auth'
import { formatDate } from '../lib/format'
import { db, errorMessage } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { showMessage } from '../components/AskDialog'

type Notice = {
  id: string
  title: string
  body: string
  is_read: boolean
  created_at: string
  type: string | null
  data: { booking_id?: string; business_id?: string } | null
}

/** How many notifications show before the "See all" button. */
const PREVIEW = 7

/** The page a notification opens when clicked, or null when it has nowhere to go. */
function targetFor(portal: 'owner' | 'admin', notice: Notice): string | null {
  const bookingId = notice.data?.booking_id
  switch (notice.type) {
    case 'booking_request':
    case 'booking_status':
    case 'booking_proposal':
      if (portal === 'admin') return '/admin/bookings'
      return bookingId ? `/owner/bookings?booking=${bookingId}` : '/owner/bookings'
    case 'business_verification':
      return portal === 'owner' ? '/owner/business' : '/admin/verification'
    case 'business_application':
      return portal === 'admin' ? '/admin/verification' : null
    default:
      return null
  }
}

/** The link text shown on a clickable notification. */
function actionLabel(target: string): string {
  if (target.includes('/bookings')) return 'View booking'
  if (target.endsWith('/business')) return 'View business'
  if (target.endsWith('/verification')) return 'Review application'
  return 'Open'
}

export default function Notifications() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const portal = useLocation().pathname.startsWith('/admin') ? 'admin' : 'owner'
  const [showAll, setShowAll] = useState(false)
  const { data, loading, error, reload } = useQuery(async () => {
    const { data: rows, error: loadError } = await db().from('notifications').select('id,title,body,is_read,created_at,type,data').eq('user_id', userId!).order('created_at', { ascending: false }).limit(100)
    if (loadError) throw loadError
    return rows as Notice[]
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const client = db()
    const channel = client.channel(`notifications-page-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, reload)
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [userId, reload])

  async function markAllRead() {
    const { error: updateError } = await db().from('notifications').update({ is_read: true }).eq('user_id', userId!).eq('is_read', false)
    if (updateError) await showMessage({ title: 'Could not mark as read', description: errorMessage(updateError) })
    reload()
  }

  // Clicking marks that notification read, then opens the page it is about.
  async function open(notice: Notice) {
    if (!notice.is_read) {
      await db().from('notifications').update({ is_read: true }).eq('id', notice.id)
    }
    const target = targetFor(portal, notice)
    if (target) navigate(target)
    else reload()
  }

  if (loading && !data) return <EmptyState title="Loading…" />
  if (error) return <ErrorBanner message={error} />
  const all = data ?? []
  const unread = all.filter(item => !item.is_read).length
  const shown = showAll ? all : all.slice(0, PREVIEW)

  return (
    <>
      <div className="toolbar">
        <p className="muted-note">{unread} unread</p>
        <button className="ghost-button" disabled={unread === 0} onClick={() => void markAllRead()}>Mark all as read</button>
      </div>
      {all.length === 0 ? <EmptyState title="You're all caught up">New activity will appear here.</EmptyState> : (
        <>
          <ul className="notice-list">{shown.map(item => {
            const target = targetFor(portal, item)
            return (
              <li key={item.id} className={item.is_read ? '' : 'unread'}>
                <button type="button" className="notice-item" onClick={() => void open(item)}>
                  <div><strong>{item.title}</strong><p>{item.body}</p></div>
                  <span className="notice-side">
                    <small>{formatDate(item.created_at)}</small>
                    {target && <span className="notice-go">{actionLabel(target)} ›</span>}
                  </span>
                </button>
              </li>
            )
          })}</ul>
          {all.length > PREVIEW && (
            <div className="notice-more">
              <button type="button" className="ghost-button" onClick={() => setShowAll(value => !value)}>
                {showAll ? 'Show less' : `See all (${all.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
