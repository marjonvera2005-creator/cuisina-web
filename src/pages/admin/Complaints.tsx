import { useState } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { ConfirmDialog } from '../../components/Dialog'
import { CATEGORY_LABEL } from '../../components/ReportProblem'
import type { ReportCategory } from '../../components/ReportProblem'
import { formatDate, formatTime } from '../../lib/format'
import { db, errorMessage } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'

type Status = 'open' | 'reviewing' | 'resolved' | 'dismissed'

type Complaint = {
  id: string
  subject: string
  description: string
  status: Status
  category: ReportCategory | null
  reporter_role: 'customer' | 'owner' | null
  admin_reply: string | null
  replied_at: string | null
  created_at: string
  /** The customer a caterer's report is about (migration 027). */
  about_customer_id?: string | null
  reporter: { full_name: string; phone: string | null } | null
  business: { business_name: string } | null
  booking: {
    event_date: string
    event_time: string
    status: string
    location: string
    customer: { full_name: string } | null
    package: { name: string } | null
  } | null
}

const STATUSES: Status[] = ['open', 'reviewing', 'resolved', 'dismissed']
type Sender = 'all' | 'customer' | 'owner'

export default function Complaints() {
  const { data, loading, error, reload } = useQuery(async () => {
    const columns = 'id,subject,description,status,category,reporter_role,admin_reply,replied_at,created_at,reporter:profiles!complaints_reporter_profile_fkey(full_name,phone),business:catering_businesses(business_name),booking:bookings(event_date,event_time,status,location,customer:profiles!bookings_customer_profile_fkey(full_name),package:catering_packages(name))'
    const load = (extra: string) => db().from('complaints').select(columns + extra).order('created_at', { ascending: false })
    // about_customer_id needs migration 027; without it the page still works.
    let result = await load(',about_customer_id')
    if (result.error) result = await load('')
    if (result.error) throw result.error
    const rows = result.data as unknown as Complaint[]
    // Account status of the customers that caterers asked to deactivate.
    const ids = [...new Set(rows.map(row => row.about_customer_id).filter((id): id is string => Boolean(id)))]
    const accounts: Record<string, { full_name: string; is_active: boolean }> = {}
    if (ids.length) {
      const { data: people } = await db().from('profiles').select('id,full_name,is_active').in('id', ids)
      for (const person of people ?? []) accounts[person.id] = { full_name: person.full_name, is_active: person.is_active }
    }
    return { rows, accounts }
  }, [])
  const [filter, setFilter] = useState<'all' | Status>('open')
  const [sender, setSender] = useState<Sender>('all')
  const [problem, setProblem] = useState('')
  const [replying, setReplying] = useState<Complaint | null>(null)
  const [nextStatus, setNextStatus] = useState<Status>('reviewing')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  // Only the administrator deactivates or reactivates a customer's account.
  const [account, setAccount] = useState<{ id: string; name: string; active: boolean } | null>(null)

  async function setCustomerActive() {
    if (!account) return
    setProblem('')
    const { error: rpcError } = await db().rpc('set_user_active', { p_user_id: account.id, p_active: account.active })
    setAccount(null)
    if (rpcError) setProblem(errorMessage(rpcError))
    reload()
  }

  function startReply(item: Complaint) {
    setReplying(item)
    setNextStatus(item.status === 'open' ? 'reviewing' : item.status)
    setReply('')
    setProblem('')
  }

  async function send() {
    if (!replying) return
    setBusy(true); setProblem('')
    const { error: rpcError } = await db().rpc('respond_to_complaint', { p_complaint_id: replying.id, p_status: nextStatus, p_reply: reply.trim() || null })
    setBusy(false)
    if (rpcError) { setProblem(errorMessage(rpcError)); return }
    setReplying(null)
    reload()
  }

  if (loading && !data) return <EmptyState title="Loading complaints…" />
  const complaints = data?.rows ?? []
  const accounts = data?.accounts ?? {}
  const bySender = sender === 'all' ? complaints : complaints.filter(item => (item.reporter_role ?? 'customer') === sender)
  const visible = filter === 'all' ? bySender : bySender.filter(item => item.status === filter)

  return (
    <>
      <ErrorBanner message={error || problem} />
      {/* Status and sender filters on one line, separated by a divider. */}
      <div className="filter-line">
      <div className="filter-row">{(['all', ...STATUSES] as const).map(option => (
        <button key={option} className={filter === option ? 'active' : ''} onClick={() => setFilter(option)}>
          {option[0].toUpperCase() + option.slice(1)} <span className="count">{option === 'all' ? bySender.length : bySender.filter(item => item.status === option).length}</span>
        </button>
      ))}</div>
      <span className="filter-divider" aria-hidden="true" />
      <div className="filter-row">{([['all', 'Everyone'], ['customer', 'From customers'], ['owner', 'From caterers']] as const).map(([value, label]) => (
        <button key={value} className={sender === value ? 'active' : ''} onClick={() => setSender(value)}>
          {label} <span className="count">{value === 'all' ? complaints.length : complaints.filter(item => (item.reporter_role ?? 'customer') === value).length}</span>
        </button>
      ))}</div>
      </div>

      {visible.length === 0 ? <EmptyState title="No complaints">Nothing matches this filter.</EmptyState> : (
        <div className="booking-list">{visible.map(item => {
          const fromOwner = item.reporter_role === 'owner'
          return (
            <article key={item.id} className="admin-card booking-card report-card">
              <div className="booking-main">
                <div>
                  <p className="report-tags">
                    <span className={`report-role ${fromOwner ? 'owner' : 'customer'}`}>{fromOwner ? 'Caterer' : 'Customer'}</span>
                    {item.category && <span className="report-category">{CATEGORY_LABEL[item.category] ?? item.category}</span>}
                    <span className={`status ${item.status === 'resolved' ? 'approved' : item.status === 'dismissed' ? 'suspended' : 'pending'}`}>{item.status}</span>
                  </p>
                  <h3>{item.subject}</h3>
                  <p className="muted-note">
                    From <strong>{item.reporter?.full_name || (fromOwner ? 'a caterer' : 'a customer')}</strong>
                    {item.reporter?.phone ? ` (${item.reporter.phone})` : ''}
                    {' · '}{formatDate(item.created_at)}
                  </p>
                </div>
                <button className="approve" onClick={() => startReply(item)}>{item.admin_reply ? 'Update / reply' : 'Reply'}</button>
              </div>

              <dl className="report-facts">
                <div><dt>Caterer</dt><dd>{item.business?.business_name ?? '—'}</dd></div>
                {item.booking ? <>
                  <div><dt>Booking</dt><dd>{formatDate(item.booking.event_date)}, {formatTime(item.booking.event_time)} · {item.booking.package?.name ?? 'Package'} · <span className="status-text">{item.booking.status.replace('_', ' ')}</span></dd></div>
                  <div><dt>Customer</dt><dd>{item.booking.customer?.full_name ?? '—'}</dd></div>
                  <div><dt>Event place</dt><dd>{item.booking.location}</dd></div>
                </> : <div><dt>Booking</dt><dd>Not about a specific booking</dd></div>}
                {item.about_customer_id && accounts[item.about_customer_id] && (() => {
                  const person = accounts[item.about_customer_id]
                  return (
                    <div><dt>Customer account</dt><dd className="account-action">
                      <span className={`status ${person.is_active ? 'approved' : 'suspended'}`}>{person.is_active ? 'Active' : 'Deactivated'}</span>
                      {person.is_active
                        ? <button className="reject danger-text" onClick={() => setAccount({ id: item.about_customer_id!, name: person.full_name || 'this customer', active: false })}>Deactivate customer</button>
                        : <button className="approve" onClick={() => setAccount({ id: item.about_customer_id!, name: person.full_name || 'this customer', active: true })}>Reactivate customer</button>}
                    </dd></div>
                  )
                })()}
              </dl>

              <p className="booking-note">{item.description}</p>
              {item.admin_reply && (
                <div className="report-reply">
                  <strong>Your reply{item.replied_at ? ` · ${formatDate(item.replied_at)}` : ''}</strong>
                  <p>{item.admin_reply}</p>
                </div>
              )}
            </article>
          )
        })}</div>
      )}

      {account && (
        <ConfirmDialog
          title={account.active ? `Reactivate ${account.name}?` : `Deactivate ${account.name}?`}
          description={account.active
            ? 'The customer can use the Cuisina app and book caterers again.'
            : 'The customer will see that their account is deactivated in the Cuisina app and cannot book any caterer until you reactivate them. Their existing bookings are kept. Remember to reply to the caterer.'}
          confirmLabel={account.active ? 'Reactivate' : 'Deactivate'}
          danger={!account.active}
          onConfirm={setCustomerActive}
          onCancel={() => setAccount(null)}
        />
      )}
      {replying && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setReplying(null) }}>
          <form className="dialog" role="dialog" aria-modal="true" aria-label="Reply to report" onSubmit={event => { event.preventDefault(); void send() }}>
            <h2>Reply to {replying.reporter_role === 'owner' ? 'caterer' : 'customer'}</h2>
            <p>{replying.subject}</p>
            <label>Status
              <select value={nextStatus} onChange={event => setNextStatus(event.target.value as Status)}>
                {STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
              </select>
            </label>
            <label>Message to {replying.reporter?.full_name || 'the sender'} <small>(optional; sent as a notification)</small>
              <textarea rows={4} value={reply} onChange={event => setReply(event.target.value)} maxLength={2000}
                placeholder="e.g. We contacted the caterer. Your deposit will be refunded within 3 days." />
            </label>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={() => setReplying(null)} disabled={busy}>Cancel</button>
              <button type="submit" className="admin-primary" disabled={busy}>{busy ? 'Sending…' : 'Save and notify'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
