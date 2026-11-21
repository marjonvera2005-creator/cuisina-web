import { Fragment, useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { EmptyState, ErrorBanner, StatusBadge } from '../../components/Brand'
import { useAuth } from '../../lib/auth'
import { formatDate } from '../../lib/format'
import { db, errorMessage } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { CatererCustomers } from './CatererCustomers'
import type { CatererInfo } from './CatererCustomers'
import { askConfirm } from '../../components/AskDialog'
import { Pager, paginate } from '../../components/Pager'

type UserRow = {
  user_id: string
  email: string
  full_name: string
  phone: string | null
  is_active: boolean
  roles: string[]
  created_at: string
}

type BusinessInfo = CatererInfo & { owner_id: string }

type Tab = 'customer' | 'owner' | 'administrator'

const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: 'customer', label: 'Customers', empty: 'No customers have registered in the app yet.' },
  { key: 'owner', label: 'Caterers', empty: 'No caterers have registered yet.' },
  { key: 'administrator', label: 'Administrators', empty: 'No administrators found.' },
]

export default function Users() {
  const { userId } = useAuth()
  const { data, loading, error, reload } = useQuery(async () => {
    const [users, businesses, bookings] = await Promise.all([
      db().rpc('admin_list_users'),
      db().from('catering_businesses').select('id,owner_id,business_name,verification_status,location_barangay'),
      db().from('bookings').select('customer_id'),
    ])
    if (users.error) throw users.error
    if (businesses.error) throw businesses.error
    if (bookings.error) throw bookings.error
    const businessByOwner: Record<string, BusinessInfo> = {}
    for (const row of (businesses.data ?? []) as BusinessInfo[]) businessByOwner[row.owner_id] = row
    const bookingCount: Record<string, number> = {}
    for (const row of (bookings.data ?? []) as { customer_id: string }[]) bookingCount[row.customer_id] = (bookingCount[row.customer_id] ?? 0) + 1
    const emailById: Record<string, string> = {}
    for (const user of users.data as UserRow[]) emailById[user.user_id] = user.email
    return { users: users.data as UserRow[], businessByOwner, bookingCount, emailById }
  }, [])
  const [tab, setTab] = useState<Tab>('customer')
  const [search, setSearch] = useState('')
  const [problem, setProblem] = useState('')
  const [openOwner, setOpenOwner] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  async function setActive(user: UserRow, active: boolean) {
    const ok = await askConfirm(active
      ? { title: `Reactivate ${user.full_name || user.email}?`, description: `${user.email} will be able to sign in and use Cuisina again.`, confirmLabel: 'Reactivate' }
      : { title: `Deactivate ${user.full_name || user.email}?`, description: `${user.email} will not be able to sign in. If this is a caterer, their business is hidden from customers. You can reactivate them later.`, confirmLabel: 'Deactivate', danger: true })
    if (!ok) return
    setProblem('')
    const { error: rpcError } = await db().rpc('set_user_active', { p_user_id: user.user_id, p_active: active })
    if (rpcError) setProblem(errorMessage(rpcError))
    reload()
  }

  if (loading && !data) return <EmptyState title="Loading users…" />
  const users = data?.users ?? []
  const term = search.trim().toLowerCase()
  const inTab = (key: Tab) => users.filter(user => user.roles.includes(key))
  const visible = inTab(tab).filter(user => !term || user.email.toLowerCase().includes(term) || user.full_name.toLowerCase().includes(term) || (user.phone ?? '').includes(term))
  const current = TABS.find(item => item.key === tab)!
  const paged = paginate(visible, page, 10)

  return (
    <>
      <ErrorBanner message={error || problem} />
      <div className="filter-row">{TABS.map(item => (
        <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => { setTab(item.key); setOpenOwner(null); setPage(1) }}>
          {item.label} <span className="count">{inTab(item.key).length}</span>
        </button>
      ))}</div>
      <div className="filter-bar single">
        <input type="search" placeholder={`Search ${current.label.toLowerCase()} by name, email, or phone`} value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} aria-label="Search users" />
      </div>
      <div className="admin-card">
        {visible.length === 0 ? <EmptyState title={term ? 'No matches' : current.empty} /> : (
          <div className="table-wrap"><table>
            <thead><tr>
              <th>{tab === 'owner' ? 'Owner' : 'User'}</th>
              <th>Mobile</th>
              {tab === 'owner' && <th>Business</th>}
              {tab === 'customer' && <th>Bookings</th>}
              <th>Joined</th>
              <th>Status</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>{paged.rows.map(user => {
              const business = data?.businessByOwner[user.user_id]
              // Caterers with a business can be clicked to see their customers (admin only).
              const canOpen = tab === 'owner' && !!business
              const isOpen = canOpen && openOwner === user.user_id
              const toggle = () => setOpenOwner(isOpen ? null : user.user_id)
              return (
                <Fragment key={user.user_id}>
                <tr className={canOpen ? `clickable-row${isOpen ? ' open' : ''}` : undefined}
                  onClick={canOpen ? event => { if (!(event.target as HTMLElement).closest('button, a')) toggle() } : undefined}>
                  <td>{canOpen
                    ? <button type="button" className="row-toggle" aria-expanded={isOpen} onClick={toggle}>
                        <CaretDown size={14} weight="bold" className="chevron" aria-hidden="true" />
                        <span><strong>{user.full_name || 'Unnamed'}</strong><small>{user.email}</small></span>
                      </button>
                    : <><strong>{user.full_name || 'Unnamed'}</strong><small>{user.email}</small></>}</td>
                  <td>{user.phone ? <a href={`tel:${user.phone}`}>{user.phone}</a> : '—'}</td>
                  {tab === 'owner' && <td>{business ? <><strong>{business.business_name}</strong><StatusBadge status={business.verification_status} /></> : <small>No application yet</small>}</td>}
                  {tab === 'customer' && <td>{data?.bookingCount[user.user_id] ?? 0}</td>}
                  <td>{formatDate(user.created_at)}</td>
                  <td><span className={`status ${user.is_active ? 'approved' : 'suspended'}`}>{user.is_active ? 'Active' : 'Deactivated'}</span></td>
                  <td><div className="row-actions">
                    {user.user_id !== userId && !user.roles.includes('administrator') && (
                      <button className="reject" onClick={() => void setActive(user, !user.is_active)}>{user.is_active ? 'Deactivate' : 'Reactivate'}</button>
                    )}
                    {user.user_id === userId && <small>You</small>}
                  </div></td>
                </tr>
                {isOpen && business && (
                  <tr className="detail-row"><td colSpan={6}>
                    <CatererCustomers business={business} emailById={data?.emailById ?? {}} />
                  </td></tr>
                )}
                </Fragment>
              )
            })}</tbody>
          </table></div>
        )}
        <Pager {...paged} noun={current.label.toLowerCase()} onPage={next => { setPage(next); setOpenOwner(null) }} />
      </div>
    </>
  )
}
