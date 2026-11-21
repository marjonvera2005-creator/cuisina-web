import { CalendarCheck, Coins, Percent, Storefront } from '@phosphor-icons/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { Avatar, StatCard } from '../../components/Charts'
import { ConfirmDialog } from '../../components/Dialog'
import { formatRate } from '../../lib/commission'
import { formatDate, peso } from '../../lib/format'
import { db, errorMessage } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'

type Report = {
  rate: number
  updated_at: string
  completed_bookings: number
  total_sales: number
  total_commission: number
  by_caterer: { business_id: string; business_name: string; bookings: number; sales: number; commission: number; caterer_receives: number }[]
  by_month: { month: string; bookings: number; sales: number; commission: number }[]
}

const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

/** Business model: Cuisina's commission on completed bookings (migration 029). */
export default function BusinessModel() {
  const { data, loading, error, reload } = useQuery(async () => {
    const { data: report, error: reportError } = await db().rpc('admin_commission_report')
    if (reportError) throw reportError
    return report as Report
  }, [])
  const [rate, setRate] = useState('')
  const [confirm, setConfirm] = useState<number | null>(null)
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState('')

  if (loading && !data) return <EmptyState title="Loading business model…" />
  if (error) {
    return /admin_commission_report|schema cache|does not exist/i.test(error)
      ? <EmptyState title="Business model not set up yet">Run <code>supabase/migrations/029_platform_commission.sql</code> in the Supabase SQL Editor, then refresh this page.</EmptyState>
      : <ErrorBanner message={error} />
  }
  if (!data) return null
  const current = Number(data.rate)

  function ask(event: FormEvent) {
    event.preventDefault()
    setFormError(''); setSaved('')
    const value = Number(rate)
    if (!rate.trim() || !Number.isFinite(value) || value < 0 || value > 50) { setFormError('Enter a commission between 0 and 50 (%).'); return }
    if (value === current) { setFormError(`The commission is already ${formatRate(current)}.`); return }
    setConfirm(Math.round(value * 100) / 100)
  }

  async function save(value: number) {
    const { error: saveError } = await db().rpc('set_commission_rate', { p_rate: value })
    if (saveError) { setFormError(errorMessage(saveError)); setConfirm(null); return }
    setConfirm(null); setRate(''); setSaved(`Commission changed to ${formatRate(value)}. New bookings use it from now on.`)
    reload()
  }

  return (
    <>
      <div className="kpi-grid">
        <StatCard icon={<Percent size={16} weight="bold" />} tone="green" label="Commission rate" value={formatRate(current)} note={`per completed booking · since ${formatDate(data.updated_at)}`} />
        <StatCard icon={<CalendarCheck size={16} weight="bold" />} tone="cream" label="Completed bookings" value={Number(data.completed_bookings).toLocaleString()} note="only completed bookings count" />
        <StatCard icon={<Storefront size={16} weight="bold" />} tone="gold" label="Total sales" value={peso(Number(data.total_sales))} note="paid by customers" />
        <StatCard icon={<Coins size={16} weight="bold" />} tone="green" label="Cuisina earnings" value={peso(Number(data.total_commission))} note={`caterers receive ${peso(Number(data.total_sales) - Number(data.total_commission))}`} />
      </div>

      <div className="admin-card">
        <div className="card-heading"><div><h2>Commission rate</h2><p className="eyebrow">Taken from the caterer’s share of each completed booking. Customers pay the same price.</p></div></div>
        <form className="bm-rate" onSubmit={ask}>
          <label>New commission (%)
            <input type="number" min={0} max={50} step="0.5" value={rate} placeholder={String(current)} onChange={event => setRate(event.target.value)} />
          </label>
          <button className="admin-primary">Change commission</button>
        </form>
        {formError && <div className="form-error bm-msg" role="alert">{formError}</div>}
        {saved && <div className="form-notice bm-msg" role="status">{saved}</div>}
        <p className="sys-note">Each booking keeps the rate that applied when it was made, so a change only affects new bookings. Every change is recorded in the audit log.</p>
      </div>

      <div className="admin-card">
        <div className="card-heading"><div><h2>Earnings by caterer</h2><p className="eyebrow">Completed bookings</p></div></div>
        {data.by_caterer.length === 0 ? <EmptyState title="No completed bookings yet">Earnings appear here when caterers complete their events.</EmptyState> : (
          <div className="table-wrap"><table className="rich-table">
            <thead><tr><th>Caterer</th><th>Completed</th><th>Sales</th><th>Cuisina earns</th><th>Caterer receives</th></tr></thead>
            <tbody>{data.by_caterer.map(row => (
              <tr key={row.business_id}>
                <td><div className="person"><Avatar name={row.business_name} /><div><strong>{row.business_name}</strong></div></div></td>
                <td>{row.bookings}</td>
                <td>{peso(Number(row.sales))}</td>
                <td><strong>{peso(Number(row.commission))}</strong></td>
                <td>{peso(Number(row.caterer_receives))}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div className="admin-card">
        <div className="card-heading"><div><h2>Earnings by month</h2><p className="eyebrow">By event date, completed bookings</p></div></div>
        {data.by_month.length === 0 ? <EmptyState title="No completed bookings yet" /> : (
          <div className="table-wrap"><table className="rich-table">
            <thead><tr><th>Month</th><th>Completed</th><th>Sales</th><th>Cuisina earns</th></tr></thead>
            <tbody>{[...data.by_month].reverse().map(row => (
              <tr key={row.month}><td><strong>{monthLabel(row.month)}</strong></td><td>{row.bookings}</td><td>{peso(Number(row.sales))}</td><td><strong>{peso(Number(row.commission))}</strong></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {confirm != null && (
        <ConfirmDialog title={`Change the commission to ${formatRate(confirm)}?`}
          description={`From ${formatRate(current)} to ${formatRate(confirm)}. Bookings made from now on use the new rate; existing bookings keep theirs.`}
          confirmLabel="Change commission" onConfirm={() => save(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </>
  )
}
