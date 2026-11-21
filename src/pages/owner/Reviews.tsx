import { Star } from '@phosphor-icons/react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { useAuth } from '../../lib/auth'
import { formatDate } from '../../lib/format'
import { fetchMyBusiness } from '../../lib/owner'
import { db } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'

type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  booking: { event_date: string; package: { name: string } | null; customer: { full_name: string } | null } | null
}

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => <Star key={n} size={size} weight={n <= Math.round(value) ? 'fill' : 'regular'} aria-hidden="true" />)}
    </span>
  )
}

/** What customers said after their events: average, spread, and every review. */
export default function Reviews() {
  const { userId } = useAuth()
  const { data, loading, error } = useQuery(async () => {
    const business = await fetchMyBusiness(userId!)
    if (!business) return null
    const { data: rows, error: loadError } = await db().from('reviews')
      .select('id,rating,comment,created_at,booking:bookings(event_date,package:catering_packages(name),customer:profiles!bookings_customer_profile_fkey(full_name))')
      .eq('business_id', business.id).order('created_at', { ascending: false })
    if (loadError) throw loadError
    return rows as unknown as ReviewRow[]
  }, [userId])

  if (loading && !data) return <EmptyState title="Loading reviews…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return <EmptyState title="Create your business profile first">Reviews appear after customers complete events with you.</EmptyState>
  if (data.length === 0) return <EmptyState title="No reviews yet">Customers can review your service after you mark their event as completed.</EmptyState>

  const average = data.reduce((sum, review) => sum + review.rating, 0) / data.length
  const spread = [5, 4, 3, 2, 1].map(stars => ({ stars, count: data.filter(review => review.rating === stars).length }))

  return (
    <div className="reviews-page">
      <section className="admin-card reviews-summary">
        <div className="reviews-average">
          <strong>{average.toFixed(1)}</strong>
          <Stars value={average} size={20} />
          <small>{data.length} review{data.length === 1 ? '' : 's'}</small>
        </div>
        <ul className="reviews-spread">
          {spread.map(row => (
            <li key={row.stars}>
              <span>{row.stars} <Star size={12} weight="fill" aria-hidden="true" /></span>
              <i><b style={{ width: `${(row.count / data.length) * 100}%` }} /></i>
              <small>{row.count}</small>
            </li>
          ))}
        </ul>
      </section>

      <ul className="review-cards">
        {data.map(review => {
          const name = review.booking?.customer?.full_name || 'Customer'
          return (
            <li key={review.id} className="admin-card review-card">
              <header>
                <span className="mini-avatar">{name.charAt(0).toUpperCase()}</span>
                <div><strong>{name}</strong><small>{review.booking?.package?.name ?? 'Package'}{review.booking ? ` · event ${formatDate(review.booking.event_date)}` : ''}</small></div>
                <Stars value={review.rating} />
              </header>
              {review.comment ? <p>{review.comment}</p> : <p className="muted-note">No written comment.</p>}
              <small className="review-date">Reviewed {formatDate(review.created_at)}</small>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
