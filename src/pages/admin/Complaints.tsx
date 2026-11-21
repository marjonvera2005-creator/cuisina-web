import { useState } from 'react'
import { ArrowBendUpLeft, CalendarBlank, ChatCircleText, MapPin, PencilSimple, Storefront, User } from '@phosphor-icons/react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { ConfirmDialog } from '../../components/Dialog'
import { CATEGORY_LABEL } from '../../components/ReportProblem'
import type { ReportCategory } from '../../components/ReportProblem'
import { formatDate, formatTime } from '../../lib/format'
import { db, errorMessage } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { toast, useToastMessage } from '../../lib/toast'

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

/** What each status means, in plain words (card badge and the reply window). */
const STATUS_INFO: Record<Status, { label: string; hint: string; tone: string }> = {
  open: { label: 'New', hint: 'Needs your reply', tone: 'new' },
  reviewing: { label: 'Reviewing', hint: 'You are looking into it', tone: 'reviewing' },
  resolved: { label: 'Resolved', hint: 'The problem is fixed', tone: 'resolved' },
  dismissed: { label: 'Dismissed', hint: 'No action needed', tone: 'dismissed' },
}
/** Choices in the reply window (a report is never set back to New). */
const REPLY_STATUSES: Status[] = ['reviewing', 'resolved', 'dismissed']
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?'
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
  const [problem, setProblem] = useToastMessage('error')
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
    else toast('Account status updated.')
    reload()
  }

  function startReply(item: Complaint) {
    setReplying(item)
    setNextStatus(item.status === 'open' ? 'reviewing' : item.status)
    setReply(item.admin_reply ?? '')
    setProblem('')
  }

  async function send() {
    if (!replying) return
    setBusy(true); setProblem('')
    const { error: rpcError } = await db().rpc('respond_to_complaint', { p_complaint_id: replying.id, p_status: nextStatus, p_reply: reply.trim() || null })
    setBusy(false)
    if (rpcError) { setProblem(errorMessage(rpcError)); return }
    toast('Saved. The sender is notified.')
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
          {option === 'all' ? 'All' : STATUS_INFO[option].label} <span className="count">{option === 'all' ? bySender.length : bySender.filter(item => item.status === option).length}</span>
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
        <div className="rc-list">{visible.map(item => {
          const fromOwner = item.reporter_role === 'owner'
          const name = item.reporter?.full_name || (fromOwner ? 'A caterer' : 'A customer')
          return (
            <article key={item.id} className={`admin-card rc-card is-${STATUS_INFO[item.status].tone}`}>
              <header className="rc-head">
                <span className={`rc-avatar ${fromOwner ? 'owner' : 'customer'}`} aria-hidden="true">{initials(name)}</span>
                <div className="rc-title">
                  <p className="rc-meta">
                    <span className={`rc-role ${fromOwner ? 'owner' : 'customer'}`}>{fromOwner ? 'Caterer' : 'Customer'}</span>
                    {item.category && <span className="rc-category">{CATEGORY_LABEL[item.category] ?? item.category}</span>}
                  </p>
                  <h3>{item.subject}</h3>
                  <p className="rc-from">
                    From <strong>{name}</strong>{item.reporter?.phone ? <> · <a href={`tel:${item.reporter.phone}`}>{item.reporter.phone}</a></> : null} · {formatDate(item.created_at)}
                  </p>
                </div>
                <div className="rc-side">
                  <span className={`rc-status ${STATUS_INFO[item.status].tone}`}>
                    <i aria-hidden="true" />{STATUS_INFO[item.status].label}<small>{STATUS_INFO[item.status].hint}</small>
                  </span>
                  <button type="button" className="rc-reply-button" onClick={() => startReply(item)}>
                    {item.admin_reply ? <PencilSimple size={16} weight="bold" /> : <ArrowBendUpLeft size={16} weight="bold" />}
                    {item.admin_reply ? 'Update reply' : 'Reply'}
                  </button>
                </div>
              </header>

              <section className="rc-message">
                <h4><ChatCircleText size={15} weight="bold" aria-hidden="true" /> What happened</h4>
                <blockquote>{item.description}</blockquote>
              </section>

              <dl className="rc-facts">
                <div><dt><Storefront size={14} aria-hidden="true" /> Caterer</dt><dd>{item.business?.business_name ?? '—'}</dd></div>
                {item.booking ? <>
                  <div><dt><CalendarBlank size={14} aria-hidden="true" /> Booking</dt><dd>{formatDate(item.booking.event_date)}, {formatTime(item.booking.event_time)}<small>{item.booking.package?.name ?? 'Package'} · {item.booking.status.replace('_', ' ')}</small></dd></div>
                  <div><dt><User size={14} aria-hidden="true" /> Customer</dt><dd>{item.booking.customer?.full_name ?? '—'}</dd></div>
                  <div><dt><MapPin size={14} aria-hidden="true" /> Event place</dt><dd>{item.booking.location}</dd></div>
                </> : <div><dt><CalendarBlank size={14} aria-hidden="true" /> Booking</dt><dd>Not about a specific booking</dd></div>}
              </dl>

              {item.about_customer_id && accounts[item.about_customer_id] && (() => {
                const person = accounts[item.about_customer_id]
                return (
                  <div className="rc-account">
                    <span>The caterer asks to deactivate <strong>{person.full_name || 'this customer'}</strong>. Account now: <span className={`status ${person.is_active ? 'approved' : 'suspended'}`}>{person.is_active ? 'Active' : 'Deactivated'}</span></span>
                    {person.is_active
                      ? <button className="reject danger-text" onClick={() => setAccount({ id: item.about_customer_id!, name: person.full_name || 'this customer', active: false })}>Deactivate customer</button>
                      : <button className="approve" onClick={() => setAccount({ id: item.about_customer_id!, name: person.full_name || 'this customer', active: true })}>Reactivate customer</button>}
                  </div>
                )
              })()}

              {item.admin_reply ? (
                <section className="rc-answer">
                  <h4><ArrowBendUpLeft size={15} weight="bold" aria-hidden="true" /> Your reply{item.replied_at ? <small> · {formatDate(item.replied_at)}</small> : null}</h4>
                  <p>{item.admin_reply}</p>
                </section>
              ) : item.status === 'open' ? (
                <p className="rc-waiting">No reply yet. {name} is waiting for an answer.</p>
              ) : null}
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
            <h2>Reply to {replying.reporter?.full_name || (replying.reporter_role === 'owner' ? 'the caterer' : 'the customer')}</h2>
            <p className="rc-dialog-subject">“{replying.subject}”</p>
            <fieldset className="rc-choices">
              <legend>Set the status</legend>
              {REPLY_STATUSES.map(status => (
                <label key={status} className={`rc-choice ${nextStatus === status ? 'selected' : ''}`}>
                  <input type="radio" name="report-status" value={status} checked={nextStatus === status} onChange={() => setNextStatus(status)} />
                  <span className={`rc-dot ${STATUS_INFO[status].tone}`} aria-hidden="true" />
                  <span><strong>{STATUS_INFO[status].label}</strong><small>{STATUS_INFO[status].hint}</small></span>
                </label>
              ))}
            </fieldset>
            <label>Your message <small>(optional · they get it as a notification)</small>
              <textarea rows={4} value={reply} onChange={event => setReply(event.target.value)} maxLength={2000}
                placeholder="e.g. We contacted the caterer. Your deposit will be refunded within 3 days." />
            </label>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={() => setReplying(null)} disabled={busy}>Cancel</button>
              <button type="submit" className="admin-primary" disabled={busy}>{busy ? 'Sending…' : 'Send reply'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
