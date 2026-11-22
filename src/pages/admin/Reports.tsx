import { CalendarCheck, Coins, DownloadSimple, Printer, Storefront, Wallet } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { Avatar, LineChart, StatCard } from '../../components/Charts'
import { lastMonths } from '../../lib/charts'
import { formatRate, splitTotal } from '../../lib/commission'
import { peso } from '../../lib/format'
import { compactPeso, downloadCsv as saveCsv, GROUPS, groupKey, groupLabel, PERIODS, periodRange } from '../../lib/reports'
import type { Group, Period } from '../../lib/reports'
import { db } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'

type Row = { business_id: string; status: string; total_price: number | null; event_date: string; commission_rate?: number | null }
type Business = { id: string; business_name: string; owner: { full_name: string | null } | null }

/** Reports: how much each caterer earns (completed bookings, after Cuisina's fee), by period. */
export default function Reports() {
  const { data, loading, error } = useQuery(async () => {
    const client = db()
    // commission_rate exists after migration 029; without it every booking is counted with no fee.
    let bookings: { data: unknown; error: { message: string } | null } = await client.from('bookings').select('business_id,status,total_price,event_date,commission_rate').limit(20000)
    if (bookings.error) bookings = await client.from('bookings').select('business_id,status,total_price,event_date').limit(20000)
    if (bookings.error) throw bookings.error
    const businesses = await client.from('catering_businesses').select('id,business_name,owner:profiles!catering_businesses_owner_profile_fkey(full_name)')
    if (businesses.error) throw businesses.error
    return { rows: bookings.data as Row[], businesses: businesses.data as unknown as Business[] }
  }, [])
  const [period, setPeriod] = useState<Period>('this-month')
  const [group, setGroup] = useState<Group>('month')
  const [caterer, setCaterer] = useState('all')

  const report = useMemo(() => {
    if (!data) return null
    const span = periodRange(period)
    const inPeriod = data.rows.filter(r => !span || (r.event_date >= span[0] && r.event_date <= span[1]))
    const names = new Map(data.businesses.map(b => [b.id, b]))
    const byCaterer = new Map<string, { id: string; name: string; owner: string; bookings: number; completed: number; cancelled: number; sales: number; fee: number; earns: number }>()
    for (const r of inPeriod) {
      const b = names.get(r.business_id)
      const entry = byCaterer.get(r.business_id) ?? { id: r.business_id, name: b?.business_name ?? 'Unknown caterer', owner: b?.owner?.full_name || '—', bookings: 0, completed: 0, cancelled: 0, sales: 0, fee: 0, earns: 0 }
      entry.bookings++
      if (['cancelled', 'rejected', 'expired'].includes(r.status)) entry.cancelled++
      if (r.status === 'completed') {
        const total = Number(r.total_price ?? 0)
        const { fee, receives } = r.commission_rate != null ? splitTotal(total, Number(r.commission_rate)) : { fee: 0, receives: total }
        entry.completed++; entry.sales += total; entry.fee += fee; entry.earns += receives
      }
      byCaterer.set(r.business_id, entry)
    }
    const caterers = [...byCaterer.values()].sort((a, b) => b.earns - a.earns || b.bookings - a.bookings)
    const sum = (k: 'bookings' | 'completed' | 'sales' | 'fee' | 'earns') => caterers.reduce((s, c) => s + c[k], 0)
    // Earnings per month (last 6 months), always shown for the trend.
    const months = lastMonths(6).map(month => {
      const done = data.rows.filter(r => r.status === 'completed' && r.event_date.slice(0, 7) === month.key)
      return { label: month.label, value: done.reduce((s, r) => s + (r.commission_rate != null ? splitTotal(r.total_price, Number(r.commission_rate)).receives : Number(r.total_price ?? 0)), 0) }
    })
    const rates = [...new Set(inPeriod.filter(r => r.commission_rate != null).map(r => Number(r.commission_rate)))]
    // Owner earnings over time (weekly / monthly / yearly) inside the chosen period, for all or one caterer.
    const buckets = new Map<string, { completed: number; sales: number; fee: number; earns: number }>()
    for (const r of inPeriod) {
      if (r.status !== 'completed' || (caterer !== 'all' && r.business_id !== caterer)) continue
      const key = groupKey(r.event_date, group)
      const bucket = buckets.get(key) ?? { completed: 0, sales: 0, fee: 0, earns: 0 }
      const total = Number(r.total_price ?? 0)
      const { fee, receives } = r.commission_rate != null ? splitTotal(total, Number(r.commission_rate)) : { fee: 0, receives: total }
      bucket.completed++; bucket.sales += total; bucket.fee += fee; bucket.earns += receives
      buckets.set(key, bucket)
    }
    const overTime = [...buckets.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, v]) => ({ key, label: groupLabel(key, group), ...v }))
    return { overTime, caterers, totals: { bookings: sum('bookings'), completed: sum('completed'), sales: sum('sales'), fee: sum('fee'), earns: sum('earns') }, months, rates, hasFee: data.rows.some(r => r.commission_rate != null) }
  }, [data, period, group, caterer])

  if (loading && !data) return <EmptyState title="Loading reports…" />
  if (error) return <ErrorBanner message={error} />
  if (!report) return null
  const periodLabel = PERIODS.find(p => p.value === period)!.label

  function downloadCsv() {
    if (!report) return
    saveCsv(`cuisina-report-${period}.csv`,
      ['Caterer', 'Owner', 'Bookings', 'Completed', 'Cancelled or rejected', 'Sales (PHP)', 'Cuisina fee (PHP)', 'Owner earns (PHP)'],
      report.caterers.map(c => [c.name, c.owner, c.bookings, c.completed, c.cancelled, c.sales.toFixed(2), c.fee.toFixed(2), c.earns.toFixed(2)]))
  }

  return (
    <>
      <div className="rp-toolbar">
        <div className="filter-row" role="group" aria-label="Report period">
          {PERIODS.map(p => <button key={p.value} type="button" className={period === p.value ? 'active' : ''} onClick={() => setPeriod(p.value)}>{p.label}</button>)}
        </div>
        <div className="rp-actions">
          <button type="button" className="outline-button" onClick={downloadCsv}><DownloadSimple size={16} weight="bold" /> Download (Excel/CSV)</button>
          <button type="button" className="outline-button" onClick={() => window.print()}><Printer size={16} weight="bold" /> Print</button>
        </div>
      </div>

      <div className="kpi-grid">
        <StatCard icon={<CalendarCheck size={26} weight="duotone" />} tone="cream" label="Bookings" value={report.totals.bookings.toLocaleString()} note={`${report.totals.completed} completed · ${periodLabel.toLowerCase()}`} />
        <StatCard icon={<Storefront size={26} weight="duotone" />} tone="gold" label="Sales" value={peso(report.totals.sales)} note="completed bookings" />
        <StatCard icon={<Wallet size={26} weight="duotone" />} tone="green" label="Owners earned" value={peso(report.totals.earns)} note="after the Cuisina fee" />
        <StatCard icon={<Coins size={26} weight="duotone" />} tone="gold" label="Cuisina earned" value={peso(report.totals.fee)}
          note={report.hasFee ? (report.rates.length ? `fee ${report.rates.map(formatRate).join(', ')}` : 'commission') : 'run migration 029 for the fee'} />
      </div>

      <div className="admin-card">
        <div className="card-heading"><div><h2>Owner earnings by caterer</h2><p className="eyebrow">{periodLabel} · by event date · earnings count completed bookings only</p></div></div>
        {report.caterers.length === 0 ? <EmptyState title="No bookings in this period">Choose another period above.</EmptyState> : (
          <div className="table-wrap"><table className="rich-table">
            <thead><tr><th>Caterer</th><th>Bookings</th><th>Completed</th><th>Cancelled / rejected</th><th>Sales</th><th>Cuisina fee</th><th>Owner earns</th></tr></thead>
            <tbody>{report.caterers.map(c => (
              <tr key={c.id}>
                <td><div className="person"><Avatar name={c.name} /><div><strong>{c.name}</strong><small>{c.owner}</small></div></div></td>
                <td>{c.bookings}</td>
                <td>{c.completed}</td>
                <td>{c.cancelled}</td>
                <td>{peso(c.sales)}</td>
                <td>{peso(c.fee)}</td>
                <td><strong>{peso(c.earns)}</strong></td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td><strong>Total</strong></td><td>{report.totals.bookings}</td><td>{report.totals.completed}</td><td>{report.caterers.reduce((s, c) => s + c.cancelled, 0)}</td>
              <td>{peso(report.totals.sales)}</td><td>{peso(report.totals.fee)}</td><td><strong>{peso(report.totals.earns)}</strong></td></tr></tfoot>
          </table></div>
        )}
      </div>

      <div className="admin-card">
        <div className="card-heading rp-heading">
          <div><h2>Owner earnings over time</h2><p className="eyebrow">{periodLabel} · completed bookings · after the Cuisina fee</p></div>
          <div className="rp-controls">
            <select value={caterer} onChange={event => setCaterer(event.target.value)} aria-label="Caterer">
              <option value="all">All caterers</option>
              {(data?.businesses ?? []).slice().sort((a, b) => a.business_name.localeCompare(b.business_name)).map(b => <option key={b.id} value={b.id}>{b.business_name}</option>)}
            </select>
            <div className="filter-row" role="group" aria-label="Group by">
              {GROUPS.map(g => <button key={g.value} type="button" className={group === g.value ? 'active' : ''} onClick={() => setGroup(g.value)}>{g.label}</button>)}
            </div>
          </div>
        </div>
        {report.overTime.length === 0 ? <EmptyState title="No completed bookings in this period">Choose another period or caterer.</EmptyState> : (
          <div className="table-wrap"><table className="rich-table">
            <thead><tr><th>{group === 'week' ? 'Week' : group === 'month' ? 'Month' : 'Year'}</th><th>Completed</th><th>Sales</th><th>Cuisina fee</th><th>{caterer === 'all' ? 'Owners earn' : 'Owner earns'}</th></tr></thead>
            <tbody>{report.overTime.map(row => (
              <tr key={row.key}><td><strong>{row.label}</strong></td><td>{row.completed}</td><td>{peso(row.sales)}</td><td>{peso(row.fee)}</td><td><strong>{peso(row.earns)}</strong></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div className="admin-card chart-card">
        <div className="chart-head"><h2>Owners’ earnings per month</h2><p>All caterers · completed bookings after the Cuisina fee · last 6 months</p></div>
        <div className="rp-chart"><LineChart label="Owners’ earnings per month" points={report.months} format={compactPeso} /></div>
      </div>
    </>
  )
}
