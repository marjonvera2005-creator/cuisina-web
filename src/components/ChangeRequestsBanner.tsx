import { Link } from 'react-router-dom'
import { PencilSimpleLine } from '@phosphor-icons/react'
import { useAuth } from '../lib/auth'
import { formatDate } from '../lib/format'
import { db } from '../lib/supabase'
import { useLiveRefresh } from '../lib/useLiveRefresh'
import { useQuery } from '../lib/useQuery'

type Row = { id: string; booking_id: string; booking: { event_date: string; customer: { full_name: string | null } | null } | null }

/**
 * "James wants to change a booking" with a Review link, for every change request the caterer has
 * not answered yet. Stays until it is answered, unlike a notification that can scroll away.
 */
export function ChangeRequestsBanner({ refreshKey = 0 }: { refreshKey?: number | string }) {
  const { userId } = useAuth()
  const { data, reload } = useQuery(async () => {
    const { data: rows } = await db().from('booking_change_requests')
      .select('id,booking_id,booking:bookings(event_date,customer:profiles!bookings_customer_profile_fkey(full_name))')
      .eq('status', 'open').order('created_at')
    return (rows ?? []) as unknown as Row[]
  }, [userId, 'change-requests-banner', refreshKey])
  useLiveRefresh(userId, reload, [], 20000)

  if (!data?.length) return null
  return (
    <section className="chg-banner" role="status" aria-label="Change requests waiting for you">
      {data.map(row => (
        <div key={row.id} className="chg-banner-row">
          <span className="chg-banner-icon" aria-hidden="true"><PencilSimpleLine size={20} weight="duotone" /></span>
          <p><strong>{row.booking?.customer?.full_name || 'A customer'}</strong> wants to change a booking
            {row.booking && <> for <strong>{formatDate(row.booking.event_date)}</strong></>}. Nothing changes until you answer.</p>
          <Link className="chg-banner-go" to={`/owner/bookings?booking=${row.booking_id}`}>Review changes</Link>
        </div>
      ))}
    </section>
  )
}
