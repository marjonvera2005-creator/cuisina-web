import { useState } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { CATEGORY_LABEL, ReportProblemDialog } from '../../components/ReportProblem'
import type { ReportCategory } from '../../components/ReportProblem'
import { useAuth } from '../../lib/auth'
import { formatDate } from '../../lib/format'
import { db } from '../../lib/supabase'
import { useLiveRefresh } from '../../lib/useLiveRefresh'
import { useQuery } from '../../lib/useQuery'

type Report = {
  id: string
  subject: string
  description: string
  category: ReportCategory
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed'
  admin_reply: string | null
  replied_at: string | null
  created_at: string
  booking: { event_date: string; customer: { full_name: string } | null } | null
}

const STATUS_TEXT: Record<Report['status'], string> = {
  open: 'Sent',
  reviewing: 'Being reviewed',
  resolved: 'Resolved',
  dismissed: 'Closed',
}

/** Caterer's "Help & support": report a problem and follow the administrator's replies. */
export default function Support() {
  const { userId } = useAuth()
  const { data, loading, error, reload } = useQuery(async () => {
    const { data: rows, error: loadError } = await db().from('complaints')
      .select('id,subject,description,category,status,admin_reply,replied_at,created_at,booking:bookings(event_date,customer:profiles!bookings_customer_profile_fkey(full_name))')
      .eq('reporter_id', userId!)
      .order('created_at', { ascending: false })
    if (loadError) throw loadError
    return rows as unknown as Report[]
  }, [userId])
  // A reply from the administrator arrives as a notification: refresh at once.
  useLiveRefresh(userId, reload)
  const [writing, setWriting] = useState(false)

  if (loading && !data) return <EmptyState title="Loading…" />
  return (
    <>
      <ErrorBanner message={error} />
      <div className="toolbar">
        <p className="muted-note">Report a problem with a customer, a booking, a payment or the system. To report a specific booking, open it in <strong>Bookings</strong> and choose <strong>Report a problem</strong>.</p>
        <button className="admin-primary inline" onClick={() => setWriting(true)}>+ Report a problem</button>
      </div>
      {(data ?? []).length === 0 ? <EmptyState title="No reports yet">Your reports and the administrator's replies appear here.</EmptyState> : (
        <div className="booking-list">{(data ?? []).map(item => (
          <article key={item.id} className="admin-card booking-card report-card">
            <div className="booking-main">
              <div>
                <h3>{item.subject}</h3>
                <p className="muted-note">
                  {CATEGORY_LABEL[item.category] ?? 'Report'}
                  {item.booking ? ` · Booking on ${formatDate(item.booking.event_date)}${item.booking.customer?.full_name ? ` (${item.booking.customer.full_name})` : ''}` : ''}
                  {' · '}{formatDate(item.created_at)}
                </p>
              </div>
              <span className={`status ${item.status === 'resolved' ? 'approved' : item.status === 'dismissed' ? 'suspended' : 'pending'}`}>{STATUS_TEXT[item.status]}</span>
            </div>
            <p className="booking-note">{item.description}</p>
            {item.admin_reply && (
              <div className="report-reply">
                <strong>Reply from Cuisina{item.replied_at ? ` · ${formatDate(item.replied_at)}` : ''}</strong>
                <p>{item.admin_reply}</p>
              </div>
            )}
          </article>
        ))}</div>
      )}
      {writing && <ReportProblemDialog onClose={() => setWriting(false)} onSent={reload} />}
    </>
  )
}
