import { useState } from 'react'
import { PREVIEW_ROWS, SeeAllButton } from '../../components/SeeAll'
import { EmptyState, ErrorBanner, StatusBadge } from '../../components/Brand'
import { formatDate, peso } from '../../lib/format'
import { expireStaleBookings } from '../../lib/owner'
import { db } from '../../lib/supabase'
import type { BookingStatus } from '../../lib/types'
import { useQuery } from '../../lib/useQuery'

type Row = {
  id: string
  event_date: string
  guest_count: number
  status: BookingStatus
  total_price: number | null
  created_at: string
  business: { business_name: string } | null
  customer: { full_name: string; phone: string | null } | null
  package: { name: string } | null
}

const FILTERS: ('all' | BookingStatus)[] = ['all', 'pending', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled']

export default function AllBookings() {
  const { data, loading, error } = useQuery(async () => {
    await expireStaleBookings()
    const { data: rows, error: loadError } = await db().from('bookings')
      .select('id,event_date,guest_count,status,total_price,created_at,business:catering_businesses(business_name),customer:profiles!bookings_customer_profile_fkey(full_name,phone),package:catering_packages(name)')
      .order('created_at', { ascending: false }).limit(500)
    if (loadError) throw loadError
    return rows as unknown as Row[]
  }, [])
  const [filter, setFilter] = useState<'all' | BookingStatus>('all')
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  if (loading && !data) return <EmptyState title="Loading bookings…" />
  if (error) return <ErrorBanner message={error} />

  const rows = data ?? []
  const term = search.trim().toLowerCase()
  const visible = rows.filter(row => (filter === 'all' || row.status === filter)
    && (!term || [row.business?.business_name, row.customer?.full_name, row.customer?.phone, row.package?.name].some(text => text?.toLowerCase().includes(term))))

  return (
    <>
      <div className="filter-row">{FILTERS.map(option => (
        <button key={option} className={filter === option ? 'active' : ''} onClick={() => { setFilter(option); setShowAll(false) }}>
          {option === 'all' ? 'All' : option.replace('_', ' ')} <span className="count">{option === 'all' ? rows.length : rows.filter(row => row.status === option).length}</span>
        </button>
      ))}</div>
      <div className="filter-bar single">
        <input type="search" placeholder="Search by caterer, customer, phone or package" value={search} onChange={event => { setSearch(event.target.value); setShowAll(false) }} aria-label="Search bookings" />
      </div>
      <div className="admin-card">
        {visible.length === 0 ? <EmptyState title="No bookings found">Nothing matches this filter.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Customer</th><th>Caterer</th><th>Package</th><th>Event date</th><th>Guests</th><th>Total</th><th>Status</th><th>Requested</th></tr></thead>
            <tbody>{(showAll ? visible : visible.slice(0, PREVIEW_ROWS)).map(row => (
              <tr key={row.id}>
                <td><strong>{row.customer?.full_name || 'Customer'}</strong><small>{row.customer?.phone || 'No phone'}</small></td>
                <td>{row.business?.business_name ?? '—'}</td>
                <td>{row.package?.name ?? '—'}</td>
                <td>{formatDate(row.event_date)}</td>
                <td>{row.guest_count}</td>
                <td>{peso(row.total_price)}</td>
                <td><StatusBadge status={row.status} /></td>
                <td>{formatDate(row.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <SeeAllButton total={visible.length} expanded={showAll} onToggle={() => setShowAll(value => !value)} />
      </div>
    </>
  )
}
