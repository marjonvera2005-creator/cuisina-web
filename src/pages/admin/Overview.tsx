import { ArrowRight, CalendarBlank, SealCheck, Storefront, Users } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { AppQrCard } from '../../components/AppQrCard'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { CaterersMap } from '../../components/CaterersMap'
import { Avatar, DonutChart, LineChart, StatCard } from '../../components/Charts'
import { lastSixMonths } from '../../lib/charts'
import { formatDate } from '../../lib/format'
import { db } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'

type Stats = {
  pending_businesses: number
  approved_businesses: number
  total_businesses: number
  customers: number
  owners: number
  bookings: number
  open_complaints: number
}

type Pending = { id: string; business_name: string; service_area: string | null; contact_email: string | null; created_at: string }

export default function Overview() {
  const { data, loading, error } = useQuery(async () => {
    const since = `${lastSixMonths()[0].key}-01`
    const [stats, pending, bookings, businesses] = await Promise.all([
      db().rpc('admin_dashboard_stats'),
      db().from('catering_businesses').select('id,business_name,service_area,contact_email,created_at').eq('verification_status', 'pending').order('created_at').limit(5),
      db().from('bookings').select('created_at').gte('created_at', since).limit(10000),
      db().from('catering_businesses').select('verification_status'),
    ])
    if (stats.error) throw stats.error
    if (pending.error) throw pending.error
    if (bookings.error) throw bookings.error
    if (businesses.error) throw businesses.error
    return {
      stats: stats.data as Stats,
      pending: pending.data as Pending[],
      bookingDates: (bookings.data as { created_at: string }[]).map(row => row.created_at),
      statuses: (businesses.data as { verification_status: string }[]).map(row => row.verification_status),
    }
  }, [])

  if (loading && !data) return <EmptyState title="Loading dashboard…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return null
  const { stats, pending, bookingDates, statuses } = data
  const months = lastSixMonths()
  const perMonth = (key: string) => bookingDates.filter(date => date.slice(0, 7) === key).length
  const now = perMonth(months[5].key), before = perMonth(months[4].key)
  const change = before === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - before) / before) * 100)
  const slices = ['approved', 'pending', 'rejected', 'suspended'].map(status => ({
    label: status[0].toUpperCase() + status.slice(1),
    value: statuses.filter(value => value === status).length,
  }))

  return (
    <>
      <div className="kpi-grid">
        <StatCard icon={<Storefront size={26} weight="duotone" />} tone="gold" label="Pending reviews" value={stats.pending_businesses} note={`${stats.open_complaints} open complaint${stats.open_complaints === 1 ? '' : 's'}`} />
        <StatCard icon={<SealCheck size={26} weight="duotone" />} tone="green" label="Approved businesses" value={stats.approved_businesses} note={`of ${stats.total_businesses} registered`} />
        <StatCard icon={<Users size={26} weight="duotone" />} tone="cream" label="Customers" value={stats.customers} note={`${stats.owners} caterer account${stats.owners === 1 ? '' : 's'}`} />
        <StatCard icon={<CalendarBlank size={26} weight="duotone" />} tone="gold" label="Bookings this month" value={now}
          trend={{ delta: now - before, text: `${Math.abs(change)}% vs last month` }} note={`${stats.bookings} all time`} />
      </div>

      <div className="chart-row">
        <div className="admin-card chart-card">
          <div className="chart-head"><h2>Booking activity</h2><p>Requests across all caterers · last 6 months</p></div>
          <LineChart label="Bookings per month" points={months.map(month => ({ label: month.label, value: perMonth(month.key) }))} />
        </div>
        <div className="admin-card chart-card">
          <div className="chart-head"><h2>Businesses by status</h2><p>{stats.total_businesses} registered caterers</p></div>
          <DonutChart slices={slices} centerLabel="businesses" />
        </div>
      </div>

      <div className="admin-card">
        <div className="card-heading"><div><h2>Caterers on the map</h2><p className="eyebrow">Approved caterers only</p></div></div>
        <CaterersMap />
      </div>

      <div className="admin-card">
        <div className="card-heading"><div><h2>Businesses awaiting approval</h2></div><Link className="outline-button" to="/admin/verification">Review all <ArrowRight size={14} weight="bold" aria-hidden="true" /></Link></div>
        {pending.length === 0 ? <EmptyState title="Queue is clear">No applications are waiting for review.</EmptyState> : (
          <div className="table-wrap"><table className="rich-table">
            <thead><tr><th>Business</th><th>Service area</th><th>Status</th><th>Applied</th><th></th></tr></thead>
            <tbody>{pending.map(item => (
              <tr key={item.id}>
                <td><div className="person"><Avatar name={item.business_name} /><div><strong>{item.business_name}</strong><small>{item.contact_email || 'No email provided'}</small></div></div></td>
                <td>{item.service_area || 'Not specified'}</td>
                <td><span className="status pending">Pending</span></td>
                <td>{formatDate(item.created_at)}</td>
                <td><Link className="row-link" to="/admin/verification">Review <ArrowRight size={14} weight="bold" aria-hidden="true" /></Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <AppQrCard />
    </>
  )
}
