import { useState } from 'react'
import { EmptyState, ErrorBanner, StatusBadge } from '../../components/Brand'
import { PREVIEW_ROWS, SeeAllButton } from '../../components/SeeAll'
import { formatDate } from '../../lib/format'
import { db } from '../../lib/supabase'
import type { BookingStatus } from '../../lib/types'
import { useQuery } from '../../lib/useQuery'

type BookingRow = {
  customer_id: string
  event_date: string
  status: BookingStatus
  created_at: string
  customer: { full_name: string; phone: string | null } | null
}

type Customer = {
  id: string
  name: string
  phone: string | null
  email: string
  bookings: number
  completed: number
  last: BookingRow
}

export type CatererInfo = { id: string; business_name: string; verification_status: string; location_barangay: string | null }

/** Admin only: everyone who has booked this caterer, grouped by customer. */
export function CatererCustomers({ business, emailById }: { business: CatererInfo; emailById: Record<string, string> }) {
  const { data, loading, error } = useQuery(async () => {
    const { data: rows, error: loadError } = await db().from('bookings')
      .select('customer_id,event_date,status,created_at,customer:profiles!bookings_customer_profile_fkey(full_name,phone)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
    if (loadError) throw loadError
    return rows as unknown as BookingRow[]
  }, [business.id])
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  if (loading && !data) return <p className="muted-note">Loading customers…</p>
  if (error) return <ErrorBanner message={error} />

  // Rows are newest first, so the first row seen for a customer is their latest booking.
  const byCustomer = new Map<string, Customer>()
  for (const row of data ?? []) {
    const found = byCustomer.get(row.customer_id)
    if (found) { found.bookings++; if (row.status === 'completed') found.completed++; continue }
    byCustomer.set(row.customer_id, {
      id: row.customer_id,
      name: row.customer?.full_name || 'Unnamed',
      phone: row.customer?.phone ?? null,
      email: emailById[row.customer_id] ?? '',
      bookings: 1,
      completed: row.status === 'completed' ? 1 : 0,
      last: row,
    })
  }
  const customers = [...byCustomer.values()]
  const term = search.trim().toLowerCase()
  const visible = customers.filter(c => !term || c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term) || (c.phone ?? '').includes(term))
  const totalBookings = data?.length ?? 0

  return (
    <div className="caterer-panel">
      <h3 className="caterer-panel-title">Customers of {business.business_name}</h3>
      <div className="caterer-facts">
        <div><span>Business</span><strong>{business.business_name}</strong></div>
        <div><span>Barangay</span><strong>{business.location_barangay || 'Not set'}</strong></div>
        <div><span>Status</span><StatusBadge status={business.verification_status} /></div>
        <div><span>Customers</span><strong>{customers.length}</strong></div>
        <div><span>Bookings</span><strong>{totalBookings}</strong></div>
      </div>

      {customers.length === 0 ? <EmptyState title="No customers yet">Nobody has booked this caterer yet.</EmptyState> : (
        <>
          {customers.length > PREVIEW_ROWS && (
            <input type="search" className="caterer-search" placeholder="Search this caterer's customers" value={search}
              onChange={event => { setSearch(event.target.value); setShowAll(false) }} aria-label="Search this caterer's customers" />
          )}
          {visible.length === 0 ? <EmptyState title="No matches" /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Customer</th><th>Mobile</th><th>Bookings</th><th>Latest booking</th></tr></thead>
              <tbody>{(showAll ? visible : visible.slice(0, PREVIEW_ROWS)).map(c => (
                <tr key={c.id}>
                  <td><div className="cust-person">
                    <span className="cust-avatar" aria-hidden="true">{c.name.trim().charAt(0).toUpperCase() || '?'}</span>
                    <span><strong>{c.name}</strong>{c.email && <small>{c.email}</small>}</span>
                  </div></td>
                  <td>{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : '—'}</td>
                  <td><strong className="cust-count">{c.bookings}</strong>{c.completed > 0 && <small>{c.completed} completed</small>}</td>
                  <td><strong>{formatDate(c.last.event_date)}</strong><StatusBadge status={c.last.status} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <SeeAllButton total={visible.length} expanded={showAll} onToggle={() => setShowAll(value => !value)} />
        </>
      )}
    </div>
  )
}
