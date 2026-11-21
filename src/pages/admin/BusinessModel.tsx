import { CalendarCheck, Coins, PencilSimple, Percent, Storefront } from '@phosphor-icons/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { Avatar, StatCard } from '../../components/Charts'
import { ConfirmDialog } from '../../components/Dialog'
import { formatRate } from '../../lib/commission'
import { formatDate, peso } from '../../lib/format'
import { db, errorMessage } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { toast, useToastMessage } from '../../lib/toast'

type Report = {
  rate: number
  updated_at: string
  completed_bookings: number
  total_sales: number
  total_commission: number
  by_caterer: { business_id: string; business_name: string; bookings: number; sales: number; commission: number; caterer_receives: number }[]
  by_month: { month: string; bookings: number; sales: number; commission: number }[]
}

/** A caterer and its own rate (migration 032); null = the platform rate. */
type CatererRate = { id: string; business_name: string; verification_status: string; commission_rate: number | null }

/** Example booking used to show what a rate means in pesos. */
const EXAMPLE = 10000

/** Cuisina's share and the caterer's share of a booking, as one bar. */
function SplitBar({ rate }: { rate: number }) {
  return (
    <div className="cr-split" role="img" aria-label={`Cuisina ${formatRate(rate)}, caterer ${formatRate(100 - rate)}`}>
      <span className="cr-split-bar"><i style={{ width: `${Math.max(rate, 1.5)}%` }} /></span>
      <span className="cr-split-labels"><span>Cuisina {formatRate(rate)}</span><span>Caterer {formatRate(100 - rate)}</span></span>
    </div>
  )
}

const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

/** Business model: Cuisina's commission on completed bookings (migration 029). */
export default function BusinessModel() {
  const { data, loading, error, reload } = useQuery(async () => {
    const { data: report, error: reportError } = await db().rpc('admin_commission_report')
    if (reportError) throw reportError
    // Each caterer's own rate. An error (migration 032 not run yet) hides the per-caterer table.
    const { data: rateRows, error: rateError } = await db().from('catering_businesses')
      .select('id,business_name,verification_status,commission_rate').order('business_name')
    return { ...(report as Report), caterers: rateError ? null : (rateRows ?? []) as CatererRate[] }
  }, [])
  const [rate, setRate] = useState('')
  const [confirm, setConfirm] = useState<number | null>(null)
  const [formError, setFormError] = useToastMessage('error')
  const [saved, setSaved] = useToastMessage('success')
  // Changing one caterer's rate: the caterer, the typed rate, and "use the platform rate".
  const [editing, setEditing] = useState<CatererRate | null>(null)
  const [catererRate, setCatererRate] = useState('')
  const [useDefault, setUseDefault] = useState(false)

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

  function openRate(caterer: CatererRate) {
    setEditing(caterer)
    setUseDefault(caterer.commission_rate == null)
    setCatererRate(caterer.commission_rate == null ? '' : String(Number(caterer.commission_rate)))
  }

  async function saveCatererRate() {
    if (!editing) return
    const value = useDefault ? null : Number(catererRate)
    if (value != null && (!catererRate.trim() || !Number.isFinite(value) || value < 0 || value > 50)) {
      toast('Enter a commission between 0 and 50 (%), or choose the default rate.', 'error')
      setEditing(null)
      return
    }
    const { error: saveError } = await db().rpc('set_business_commission_rate', { p_business_id: editing.id, p_rate: value })
    if (saveError) toast(errorMessage(saveError), 'error')
    else toast(`${editing.business_name} now uses ${value == null ? `the default rate (${formatRate(current)})` : formatRate(value)} for new bookings.`)
    setEditing(null)
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
        <div className="card-heading"><div><h2>Rate per caterer</h2><p className="eyebrow">How much Cuisina keeps from each caterer’s completed bookings</p></div></div>
        {/* How it works, with an example anyone can follow. */}
        <div className="cr-explain">
          <div>
            <strong>How it works</strong>
            <p>Customers always pay the same price. When an event is completed, Cuisina keeps a percentage and the caterer receives the rest.
              Every caterer uses the <b>standard rate ({formatRate(current)})</b> unless you give them a <b>special rate</b>.</p>
          </div>
          <div className="cr-example" aria-label={`Example: a ₱${EXAMPLE.toLocaleString()} booking at ${formatRate(current)}`}>
            <span>Example: a {peso(EXAMPLE)} booking at {formatRate(current)}</span>
            <SplitBar rate={current} />
            <span className="cr-example-amounts"><b>Cuisina {peso(EXAMPLE * current / 100)}</b><b>Caterer {peso(EXAMPLE * (100 - current) / 100)}</b></span>
          </div>
        </div>
        {data.caterers == null ? (
          <p className="sys-note">To set a rate per caterer, run <code>supabase/migrations/032_caterer_commission.sql</code> in the Supabase SQL Editor, then refresh this page.</p>
        ) : data.caterers.length === 0 ? <EmptyState title="No caterers yet" /> : (
          <div className="table-wrap"><table className="rich-table cr-table">
            <thead><tr><th>Caterer</th><th>Rate</th><th>Split of each booking</th><th>From a {peso(EXAMPLE)} booking</th><th /></tr></thead>
            <tbody>{data.caterers.map(caterer => {
              const special = caterer.commission_rate != null
              const rate = special ? Number(caterer.commission_rate) : current
              return (
                <tr key={caterer.id}>
                  <td><div className="person"><Avatar name={caterer.business_name} /><div><strong>{caterer.business_name}</strong>
                    <small className={`cr-verify ${caterer.verification_status}`}>{caterer.verification_status === 'approved' ? 'Approved caterer' : `${caterer.verification_status[0].toUpperCase()}${caterer.verification_status.slice(1)} verification`}</small></div></div></td>
                  <td>{special
                    ? <span className="cr-badge special"><b>{formatRate(rate)}</b> Special rate</span>
                    : <span className="cr-badge"><b>{formatRate(rate)}</b> Standard rate</span>}</td>
                  <td><SplitBar rate={rate} /></td>
                  <td className="cr-amounts"><span>Cuisina <b>{peso(EXAMPLE * rate / 100)}</b></span><span>Caterer <b>{peso(EXAMPLE * (100 - rate) / 100)}</b></span></td>
                  <td><button type="button" className="cr-change" onClick={() => openRate(caterer)}><PencilSimple size={15} weight="bold" /> Change rate</button></td>
                </tr>
              )
            })}</tbody>
          </table></div>
        )}
        <p className="sys-note">A new rate counts for the caterer’s new bookings only. Bookings already made keep the rate they were made with, so agreed prices never change.</p>
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

      {editing && (
        <ConfirmDialog title={`Rate for ${editing.business_name}`}
          description={`Now: ${editing.commission_rate == null ? `standard rate (${formatRate(current)})` : `special rate (${formatRate(Number(editing.commission_rate))})`}. The new rate counts for this caterer’s new bookings only.`}
          confirmLabel="Save rate" onConfirm={saveCatererRate} onCancel={() => setEditing(null)}>
          <fieldset className="rc-choices">
            <legend>Which rate?</legend>
            <label className={`rc-choice ${useDefault ? 'selected' : ''}`}>
              <input type="radio" name="rate-kind" checked={useDefault} onChange={() => setUseDefault(true)} />
              <span className="rc-dot resolved" aria-hidden="true" />
              <span><strong>Standard rate ({formatRate(current)})</strong><small>Same as all other caterers. Follows the rate above if you change it.</small></span>
            </label>
            <label className={`rc-choice ${!useDefault ? 'selected' : ''}`}>
              <input type="radio" name="rate-kind" checked={!useDefault} onChange={() => setUseDefault(false)} />
              <span className="rc-dot new" aria-hidden="true" />
              <span><strong>Special rate</strong><small>Only for {editing.business_name}, e.g. a lower rate for a new partner.</small></span>
            </label>
          </fieldset>
          {!useDefault && (
            <label>Special rate for this caterer (%)
              <input type="number" min={0} max={50} step="0.5" value={catererRate} onChange={event => setCatererRate(event.target.value)} placeholder={`0 to 50, e.g. ${Math.max(0, current - 2)}`} autoFocus />
            </label>
          )}
          {(() => {
            const preview = useDefault ? current : Number(catererRate)
            if (!useDefault && (!catererRate.trim() || !Number.isFinite(preview) || preview < 0 || preview > 50)) return <p className="cr-preview-hint">Type a rate from 0 to 50 to see the split.</p>
            return (
              <div className="cr-preview">
                <span>On a {peso(EXAMPLE)} booking:</span>
                <SplitBar rate={preview} />
                <span className="cr-example-amounts"><b>Cuisina {peso(EXAMPLE * preview / 100)}</b><b>Caterer {peso(EXAMPLE * (100 - preview) / 100)}</b></span>
              </div>
            )
          })()}
        </ConfirmDialog>
      )}
      {confirm != null && (
        <ConfirmDialog title={`Change the commission to ${formatRate(confirm)}?`}
          description={`From ${formatRate(current)} to ${formatRate(confirm)}. Bookings made from now on use the new rate; existing bookings keep theirs.`}
          confirmLabel="Change commission" onConfirm={() => save(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </>
  )
}
