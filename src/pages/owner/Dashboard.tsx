import { useState } from 'react'
import { ArrowRight, CalendarBlank, CalendarCheck, ChartBar, ClipboardText, Clock, Crown, CurrencyCircleDollar, Sparkle, Star, Users } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorBanner, LeafSprig, StatusBadge } from '../../components/Brand'
import { ChangeRequestsBanner } from '../../components/ChangeRequestsBanner'
import { LineChart, StatCard } from '../../components/Charts'
import { lastMonths } from '../../lib/charts'
import { useAuth } from '../../lib/auth'
import { bookingNumbers, byPackageName, formatDate, peso } from '../../lib/format'
import { fetchCommissionRates, splitTotal } from '../../lib/commission'
import { expireStaleBookings, fetchMyBusiness } from '../../lib/owner'
import { db, publicImageUrl } from '../../lib/supabase'
import { useLiveRefresh } from '../../lib/useLiveRefresh'
import { useQuery } from '../../lib/useQuery'

type RecentBooking = {
  id: string
  event_date: string
  guest_count: number
  status: string
  total_price: number | null
  created_at: string
  package: { id: string; name: string; price: number } | null
  customer: { full_name: string } | null
}

type PackageInfo = {
  id: string
  name: string
  description: string | null
  minimum_guests: number
  package_images: { file_path: string; sort_order: number }[]
}

const CONFIRMED = ['accepted', 'in_progress', 'completed']

export default function Dashboard() {
  const { userId } = useAuth()
  const [range, setRange] = useState<6 | 12>(6)
  const { data, loading, error, reload } = useQuery(async () => {
    await expireStaleBookings()
    const business = await fetchMyBusiness(userId!)
    if (!business) return { business: null, bookings: [] as RecentBooking[], packages: [] as PackageInfo[], ratings: [] as number[], documents: 0, rates: new Map<string, number>() }
    const client = db()
    const [bookings, packages, reviews, documents] = await Promise.all([
      client.from('bookings')
        .select('id,event_date,guest_count,status,total_price,created_at,package:catering_packages(id,name,price),customer:profiles!bookings_customer_profile_fkey(full_name)')
        .eq('business_id', business.id).order('created_at', { ascending: false }).limit(1000),
      client.from('catering_packages').select('id,name,description,minimum_guests,package_images(file_path,sort_order)').eq('business_id', business.id).eq('is_archived', false).order('created_at', { ascending: true }),
      client.from('reviews').select('rating').eq('business_id', business.id),
      client.from('business_verification_documents').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
    ])
    if (bookings.error) throw bookings.error
    return {
      business,
      bookings: (bookings.data ?? []) as unknown as RecentBooking[],
      packages: byPackageName((packages.data ?? []) as PackageInfo[]),
      ratings: (reviews.data ?? []).map(row => (row as { rating: number }).rating),
      documents: documents.count ?? 0,
      rates: await fetchCommissionRates(business.id),
    }
  }, [userId])

  // New booking requests and status changes show up without refreshing the page.
  useLiveRefresh(userId, reload, ['bookings'])

  // Customers only see the caterer on the map once the owner pins the business location.
  const pinned = useQuery(async () => {
    const business = await fetchMyBusiness(userId!)
    if (!business) return true
    const { data: row, error: pinError } = await db().from('catering_businesses').select('location_lat').eq('id', business.id).maybeSingle()
    return pinError ? true : row?.location_lat != null
  }, [userId])

  if (loading && !data) return <EmptyState title="Loading dashboard…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return null

  const { business, bookings, packages, ratings, documents, rates } = data
  if (!business) {
    return (
      <div className="admin-card callout">
        <h2>Register your catering business</h2>
        <p>Tell us about your business and upload verification documents. Once an administrator approves it, your packages go live on the marketplace.</p>
        <Link className="admin-primary inline" to="/owner/business">Create business profile</Link>
      </div>
    )
  }

  const count = (status: string) => bookings.filter(booking => booking.status === status).length
  const upcoming = bookings.filter(booking => ['accepted', 'in_progress'].includes(booking.status))
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
  const months = lastMonths(range)
  const thisMonth = months[months.length - 1].key, lastMonth = months[months.length - 2].key
  const inMonth = (key: string) => bookings.filter(booking => booking.created_at.slice(0, 7) === key)
  // Earnings after Cuisina's fee on each booking (migration 029); before the migration, the full total.
  const earned = (list: RecentBooking[]) => list.filter(b => CONFIRMED.includes(b.status))
    .reduce((sum, b) => sum + (rates.has(b.id) ? splitTotal(b.total_price, rates.get(b.id)!).receives : (b.total_price ?? 0)), 0)
  const percentChange = (now: number, before: number) => (before === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - before) / before) * 100))
  const requestsNow = inMonth(thisMonth).length, requestsBefore = inMonth(lastMonth).length
  const earnedNow = earned(inMonth(thisMonth)), earnedBefore = earned(inMonth(lastMonth))

  // Top package: most requested this month; if nothing this month, over the last six months.
  const tally = (list: RecentBooking[]) => {
    const counts = new Map<string, number>()
    for (const booking of list) if (booking.package?.id) counts.set(booking.package.id, (counts.get(booking.package.id) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  }
  const sixMonthKey = lastMonths(6)[0].key
  const topThisMonth = tally(inMonth(thisMonth))
  const top = topThisMonth ?? tally(bookings.filter(booking => booking.created_at.slice(0, 7) >= sixMonthKey))
  const topPackage = top ? packages.find(pack => pack.id === top[0]) : undefined
  const topPhoto = topPackage ? [...topPackage.package_images].sort((a, b) => a.sort_order - b.sort_order)[0] : undefined
  const rating = ratings.length ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null

  const numbers = bookingNumbers(bookings)

  return (
    <>
      {business.verification_status !== 'approved' && (
        <div className={`status-banner ${business.verification_status}`}>
          <div>
            <strong>{business.business_name} is {business.verification_status}.</strong>{' '}
            {business.verification_status === 'pending' && 'An administrator is reviewing your application. Your listing is not public yet.'}
            {business.verification_status === 'rejected' && (business.rejection_reason ? `Reason: ${business.rejection_reason}` : 'Update your details and resubmit.')}
            {business.verification_status === 'suspended' && 'Your listing is hidden. Contact support for details.'}
          </div>
          <Link to="/owner/business">Review application →</Link>
        </div>
      )}
      <ChangeRequestsBanner />
      {pinned.data === false && (
        <div className="status-banner pending">
          <div><strong>Your business location is not pinned yet.</strong> Customers cannot see you on the map, and booking maps cannot show the route to events.</div>
          <Link to="/owner/business">Pin your location →</Link>
        </div>
      )}
      {(business.verification_status !== 'approved' || packages.length === 0) && (
        <div className="admin-card checklist">
          <div className="card-heading"><div><h2>Get your business in front of customers</h2></div></div>
          <ol>
            <li className="done"><span>✓</span> Register your business</li>
            <li className={documents > 0 ? 'done' : ''}><span>{documents > 0 ? '✓' : '2'}</span> <Link to="/owner/business">Upload your verification documents</Link></li>
            <li className={business.verification_status === 'approved' ? 'done' : ''}><span>{business.verification_status === 'approved' ? '✓' : '3'}</span> Wait for administrator approval</li>
            <li className={packages.length > 0 ? 'done' : ''}><span>{packages.length > 0 ? '✓' : '4'}</span> <Link to="/owner/packages">Add packages with your menu and photos</Link></li>
          </ol>
          <p className="muted-note checklist-note">Customers see your packages in the Cuisina app once your business is approved.</p>
        </div>
      )}

      <div className="kpi-grid">
        <StatCard icon={<CalendarCheck size={26} />} tone="gold" label="Pending Requests" value={count('pending')} note="Requests expire after 48 hours" to="/owner/bookings" />
        <StatCard icon={<Clock size={26} />} tone="green" label="Upcoming Events" value={upcoming.length}
          note={upcoming[0] ? `Next: ${formatDate(upcoming[0].event_date)}` : 'Nothing scheduled yet'} to="/owner/calendar" />
        <StatCard icon={<Star size={26} />} tone="green" label="Total Bookings" value={bookings.length}
          trend={{ delta: requestsNow - requestsBefore, text: `${Math.abs(percentChange(requestsNow, requestsBefore))}% vs last month` }} to="/owner/bookings" />
        <StatCard icon={<CurrencyCircleDollar size={26} />} tone="gold" label="Total Earnings (Est.)" value={peso(earned(bookings))} note={rates.size ? 'after the Cuisina fee' : undefined}
          trend={{ delta: earnedNow - earnedBefore, text: `${Math.abs(percentChange(earnedNow, earnedBefore))}% vs last month` }} to="/owner/bookings" />
      </div>

      <div className="chart-row">
        <div className="admin-card chart-card">
          <div className="chart-head row">
            <h2><ChartBar size={24} weight="fill" className="head-icon" aria-hidden="true" /> Booking Requests</h2>
            <select className="range-select" value={range} onChange={event => setRange(Number(event.target.value) as 6 | 12)} aria-label="Time range">
              <option value={6}>Last 6 Months</option>
              <option value={12}>Last 12 Months</option>
            </select>
          </div>
          <LineChart showValues fill label="Booking requests per month" points={months.map(month => ({ label: month.label, value: inMonth(month.key).length }))} />
          {(() => {
            const counts = months.map(month => ({ label: month.label, count: inMonth(month.key).length }))
            const total = counts.reduce((sum, c) => sum + c.count, 0)
            const busiest = counts.reduce((best, c) => (c.count > best.count ? c : best), counts[0])
            const now = inMonth(thisMonth).length, before = inMonth(lastMonth).length
            return (
              <div className="chart-summary">
                <div><span>Total requests</span><strong>{total}</strong><small>last {range} months</small></div>
                <div><span>Busiest month</span><strong>{busiest.count > 0 ? busiest.label : '—'}</strong><small>{busiest.count} request{busiest.count === 1 ? '' : 's'}</small></div>
                <div><span>This month</span><strong>{now}</strong><small>{before === now ? 'same as last month' : `${now > before ? '+' : ''}${now - before} vs last month`}</small></div>
              </div>
            )
          })()}
        </div>

        <div className="admin-card chart-card top-package">
          <Sparkle className="sparkle big" size={30} weight="fill" aria-hidden="true" />
          <Sparkle className="sparkle small" size={14} weight="fill" aria-hidden="true" />
          <LeafSprig className="card-leaf" />
          <div className="chart-head">
            <h2><Crown size={26} weight="fill" className="head-icon gold" aria-hidden="true" /> Top Package</h2>
            <p>{topThisMonth ? 'Most booked package this month' : 'Most booked package in the last 6 months'}</p>
          </div>
          {topPackage ? (
            <div className="top-package-body">
              <img src={publicImageUrl(topPhoto?.file_path) ?? `${import.meta.env.BASE_URL}welcome-table.jpg`} alt={topPackage.name} />
              <div>
                <h3>{topPackage.name}</h3>
                {topPackage.description && <p className="top-desc">{topPackage.description}</p>}
                <ul>
                  <li><Users size={18} weight="fill" aria-hidden="true" /> From {topPackage.minimum_guests} guests</li>
                  <li><Star size={18} weight="fill" className="star" aria-hidden="true" /> {rating ? `${rating.toFixed(1)} (${ratings.length} review${ratings.length === 1 ? '' : 's'})` : 'No reviews yet'}</li>
                </ul>
                <Link className="pill-button dark" to="/owner/packages">View Package <ArrowRight size={16} weight="bold" /></Link>
              </div>
            </div>
          ) : <p className="muted-note chart-empty">Your most booked package will appear here once requests come in.</p>}
        </div>
      </div>

      <div className="admin-card recent-card">
        <div className="card-heading">
          <div><h2><ClipboardText size={26} className="head-icon" aria-hidden="true" /> Recent Booking Requests</h2></div>
          <Link className="pill-button" to="/owner/bookings">View All <ArrowRight size={16} weight="bold" /></Link>
        </div>
        {bookings.length === 0 ? <EmptyState title="No bookings yet">Requests from customers will appear here.</EmptyState> : (
          <div className="table-wrap"><table className="rich-table recent-table">
            <thead><tr><th>#</th><th>Customer</th><th>Package</th><th>Event Date</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{bookings.slice(0, 5).map(booking => {
              const name = booking.customer?.full_name || 'Customer'
              return (
                <tr key={booking.id}>
                  <td className="bk-no">{numbers.get(booking.id)}</td>
                  <td><div className="person"><span className="mini-avatar">{name.charAt(0).toUpperCase()}</span><strong>{name}</strong></div></td>
                  <td>{booking.package?.name ?? '—'}</td>
                  <td><span className="date-cell"><CalendarBlank size={18} aria-hidden="true" /> {formatDate(booking.event_date)}</span></td>
                  <td><StatusBadge status={booking.status} /></td>
                  <td><Link className="view-button" to={`/owner/bookings?booking=${booking.id}`}>View</Link></td>
                </tr>
              )
            })}</tbody>
          </table></div>
        )}
      </div>
    </>
  )
}
