import { CalendarCheck, Coins, DownloadSimple, HourglassMedium, Printer, Receipt, UsersThree, Wallet } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { EmptyState, ErrorBanner } from '../../components/Brand'
import { StatCard } from '../../components/Charts'
import { useAuth } from '../../lib/auth'
import { formatRate, splitTotal } from '../../lib/commission'
import { formatDate, peso } from '../../lib/format'
import { fetchMyBusiness } from '../../lib/owner'
import { bucketKeys, downloadCsv, GROUPS, groupKey, groupLabel, inPeriod, PERIODS, periodRange, shortGroupLabel } from '../../lib/reports'
import type { Group, Period } from '../../lib/reports'
import { db } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'

type Row = {
  id: string
  event_date: string
  status: string
  guest_count: number
  total_price: number | null
  commission_rate?: number | null
  package: { name: string } | null
  category: { name: string } | null
  customer: { full_name: string | null } | null
}

const SELECT = 'id,event_date,status,guest_count,total_price,package:catering_packages(name),category:event_categories(name),customer:profiles!bookings_customer_profile_fkey(full_name)'
const UPCOMING = ['accepted', 'in_progress']

/** The caterer's own detailed earnings report: totals, over time, by package and event type, and every booking. */
export default function OwnerReports() {
  const { userId } = useAuth()
  const { data, loading, error } = useQuery(async () => {
    const business = await fetchMyBusiness(userId!)
    if (!business) return null
    const client = db()
    // commission_rate exists after migration 029; without it the fee is shown as none.
    let res: { data: unknown; error: { message: string } | null } = await client.from('bookings').select(`${SELECT},commission_rate`).eq('business_id', business.id).limit(10000)
    if (res.error) res = await client.from('bookings').select(SELECT).eq('business_id', business.id).limit(10000)
    if (res.error) throw res.error
    return { business, rows: res.data as unknown as Row[] }
  }, [userId])
  const [period, setPeriod] = useState<Period>('this-month')
  const [group, setGroup] = useState<Group>('week')

  const report = useMemo(() => {
    if (!data) return null
    const split = (r: Row) => {
      const total = Number(r.total_price ?? 0)
      return r.commission_rate != null ? { total, ...splitTotal(total, Number(r.commission_rate)), rate: Number(r.commission_rate) } : { total, fee: 0, receives: total, rate: null as number | null }
    }
    const rows = data.rows.filter(r => inPeriod(r.event_date, period))
    const done = rows.filter(r => r.status === 'completed').sort((a, b) => b.event_date.localeCompare(a.event_date))
    const upcoming = rows.filter(r => UPCOMING.includes(r.status))
    const sum = (list: Row[], k: 'total' | 'fee' | 'receives') => list.reduce((s, r) => s + split(r)[k], 0)

    const tally = (key: (r: Row) => string) => {
      const map = new Map<string, { name: string; count: number; guests: number; earns: number }>()
      for (const r of done) {
        const name = key(r)
        const entry = map.get(name) ?? { name, count: 0, guests: 0, earns: 0 }
        entry.count++; entry.guests += r.guest_count; entry.earns += split(r).receives
        map.set(name, entry)
      }
      return [...map.values()].sort((a, b) => b.earns - a.earns)
    }

    const buckets = new Map<string, { completed: number; sales: number; fee: number; earns: number }>()
    for (const r of done) {
      const key = groupKey(r.event_date, group)
      const b = buckets.get(key) ?? { completed: 0, sales: 0, fee: 0, earns: 0 }
      const s = split(r)
      b.completed++; b.sales += s.total; b.fee += s.fee; b.earns += s.receives
      buckets.set(key, b)
    }
    // Every period in range, including empty ones, so the gaps between busy weeks are visible.
    const span = periodRange(period)
    const dates = done.map(r => r.event_date).sort()
    const from = span ? span[0] : dates[0], to = span ? span[1] : dates[dates.length - 1]
    const keys = from && to ? bucketKeys(from, to, group) : []
    const overTime = keys.map(key => ({ key, label: groupLabel(key, group), short: shortGroupLabel(key, group), ...(buckets.get(key) ?? { completed: 0, sales: 0, fee: 0, earns: 0 }) }))

    return {
      rows, done, upcoming, overTime, split,
      sales: sum(done, 'total'), fee: sum(done, 'fee'), earns: sum(done, 'receives'),
      expected: sum(upcoming, 'receives'),
      guests: done.reduce((s, r) => s + r.guest_count, 0),
      cancelled: rows.filter(r => ['cancelled', 'rejected', 'expired'].includes(r.status)).length,
      byPackage: tally(r => r.package?.name ?? 'Package'),
      byEvent: tally(r => r.category?.name ?? 'Other event'),
    }
  }, [data, period, group])

  if (loading && !data) return <EmptyState title="Loading your reports…" />
  if (error) return <ErrorBanner message={error} />
  if (!data || !report) return <EmptyState title="No business yet">Register your business to see reports.</EmptyState>
  const periodLabel = PERIODS.find(p => p.value === period)!.label
  const average = report.done.length ? report.earns / report.done.length : 0

  function exportCsv() {
    if (!report) return
    downloadCsv(`my-earnings-${period}.csv`,
      ['Event date', 'Customer', 'Package', 'Event type', 'Guests', 'Total (PHP)', 'Cuisina fee (PHP)', 'You receive (PHP)'],
      report.done.map(r => { const s = report.split(r); return [r.event_date, r.customer?.full_name ?? '', r.package?.name ?? '', r.category?.name ?? '', r.guest_count, s.total.toFixed(2), s.fee.toFixed(2), s.receives.toFixed(2)] }))
  }

  return (
    <>
      <div className="rp-toolbar">
        <div className="filter-row" role="group" aria-label="Report period">
          {PERIODS.map(p => <button key={p.value} type="button" className={period === p.value ? 'active' : ''} onClick={() => setPeriod(p.value)}>{p.label}</button>)}
        </div>
        <div className="rp-actions">
          <button type="button" className="outline-button" onClick={exportCsv}><DownloadSimple size={16} weight="bold" /> Download (Excel/CSV)</button>
          <button type="button" className="outline-button" onClick={() => window.print()}><Printer size={16} weight="bold" /> Print</button>
        </div>
      </div>

      <div className="kpi-grid">
        <StatCard icon={<Wallet size={16} weight="bold" />} tone="green" label="You earned" value={peso(report.earns)} note={`${periodLabel.toLowerCase()} · after the Cuisina fee`} />
        <StatCard icon={<Receipt size={16} weight="bold" />} tone="gold" label="Total sales" value={peso(report.sales)} note={`Cuisina fee ${peso(report.fee)}`} />
        <StatCard icon={<CalendarCheck size={16} weight="bold" />} tone="cream" label="Completed events" value={report.done.length} note={`${report.cancelled} cancelled or rejected`} />
        <StatCard icon={<HourglassMedium size={16} weight="bold" />} tone="gold" label="Expected earnings" value={peso(report.expected)} note={`${report.upcoming.length} accepted, not yet completed`} />
      </div>
      <div className="kpi-grid rp-second">
        <StatCard icon={<Coins size={16} weight="bold" />} tone="cream" label="Average per event" value={peso(average)} note="what you receive" />
        <StatCard icon={<UsersThree size={16} weight="bold" />} tone="green" label="Guests served" value={report.guests.toLocaleString()} note="completed events" />
      </div>

      <div className="admin-card">
        <div className="card-heading rp-heading">
          <div><h2>Earnings over time</h2><p className="eyebrow">{periodLabel} · completed events · after the Cuisina fee</p></div>
          <div className="filter-row" role="group" aria-label="Group by">
            {GROUPS.map(g => <button key={g.value} type="button" className={group === g.value ? 'active' : ''} onClick={() => setGroup(g.value)}>{g.label}</button>)}
          </div>
        </div>
        {report.done.length === 0 ? <EmptyState title="No completed events in this period">Choose another period above.</EmptyState> : (() => {
          const unit = group === 'week' ? 'Week' : group === 'month' ? 'Month' : 'Year'
          const active = report.overTime.filter(r => r.completed > 0)
          const best = Math.max(...report.overTime.map(r => r.earns))
          return <>
            <div className="ot-summary">
              <div><span>You earned</span><strong>{peso(report.earns)}</strong></div>
              <div><span>Average per {unit.toLowerCase()}</span><strong>{peso(report.earns / Math.max(1, report.overTime.length))}</strong></div>
              <div><span>Best {unit.toLowerCase()}</span><strong>{peso(best)}</strong></div>
              <div><span>{unit}s with events</span><strong>{active.length} of {report.overTime.length}</strong></div>
            </div>
            <div className="table-wrap"><table className="rich-table ot-table">
              <thead><tr><th>{unit}</th><th className="num">Events</th><th className="num">Sales</th><th className="num">Cuisina fee</th><th className="num">You earned</th><th className="ot-share-head">Share</th></tr></thead>
              <tbody>{[...report.overTime].reverse().filter(row => row.completed > 0).map(row => {
                const share = Math.round((row.earns / Math.max(1, report.earns)) * 100)
                return (
                  <tr key={row.key}>
                    <td><strong>{row.label}</strong></td>
                    <td className="num">{row.completed}</td>
                    <td className="num">{peso(row.sales)}</td>
                    <td className="num muted">− {peso(row.fee)}</td>
                    <td className="num"><strong>{peso(row.earns)}</strong></td>
                    <td><div className="ot-share"><i style={{ width: `${share}%` }} /><span>{share}%</span></div></td>
                  </tr>
                )
              })}</tbody>
            </table></div>
          </>
        })()}
      </div>

      <div className="chart-row">
        <Breakdown title="By package" rows={report.byPackage} />
        <Breakdown title="By event type" rows={report.byEvent} />
      </div>

      <div className="admin-card">
        <div className="card-heading"><div><h2>Every completed event</h2><p className="eyebrow">{periodLabel} · newest first</p></div></div>
        {report.done.length === 0 ? <EmptyState title="No completed events in this period" /> : (
          <div className="table-wrap"><table className="rich-table">
            <thead><tr><th>Event date</th><th>Customer</th><th>Package</th><th>Guests</th><th>Total</th><th>Cuisina fee</th><th>You receive</th></tr></thead>
            <tbody>{report.done.map(r => {
              const s = report.split(r)
              return (
                <tr key={r.id}>
                  <td>{formatDate(r.event_date)}</td>
                  <td><strong>{r.customer?.full_name || 'Customer'}</strong><small>{r.category?.name ?? ''}</small></td>
                  <td>{r.package?.name ?? 'Package'}</td>
                  <td>{r.guest_count}</td>
                  <td>{peso(s.total)}</td>
                  <td>{peso(s.fee)}{s.rate != null && <small>{formatRate(s.rate)}</small>}</td>
                  <td><strong>{peso(s.receives)}</strong></td>
                </tr>
              )
            })}</tbody>
            <tfoot><tr><td><strong>Total</strong></td><td>{report.done.length} events</td><td></td><td>{report.guests}</td><td>{peso(report.sales)}</td><td>{peso(report.fee)}</td><td><strong>{peso(report.earns)}</strong></td></tr></tfoot>
          </table></div>
        )}
      </div>
    </>
  )
}

function Breakdown({ title, rows }: { title: string; rows: { name: string; count: number; guests: number; earns: number }[] }) {
  const top = Math.max(1, ...rows.map(r => r.earns))
  return (
    <div className="admin-card">
      <div className="card-heading"><div><h2>{title}</h2><p className="eyebrow">Completed events · what you earned</p></div></div>
      {rows.length === 0 ? <EmptyState title="Nothing yet" /> : (
        <ul className="rp-bars">{rows.map(r => (
          <li key={r.name}>
            <div><strong>{r.name}</strong><span>{peso(r.earns)}</span></div>
            <i style={{ width: `${Math.round((r.earns / top) * 100)}%` }} />
            <small>{r.count} event{r.count === 1 ? '' : 's'} · {r.guests} guests</small>
          </li>
        ))}</ul>
      )}
    </div>
  )
}
