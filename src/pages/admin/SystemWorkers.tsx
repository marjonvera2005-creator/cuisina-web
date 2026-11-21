import { ArrowRight, Cpu, Database, HardDrives, Memory, Play, StopCircle, UsersThree } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { StatCard } from '../../components/Charts'
import { AppQrCard } from '../../components/AppQrCard'
import bench from './benchmark.json'

/**
 * "System & workers": how a booking travels through Cuisina's parallel booking server and how many
 * bookings each worker process handles, read live from the server running on this laptop
 * (parallel-booking/server.mjs, local test database only). When the server is not running, the page
 * shows the benchmark measured on this laptop instead.
 */
const SERVER = (import.meta.env.VITE_BOOKING_SERVER as string | undefined) ?? 'http://localhost:5300'

type Worker = { worker: number; core: number; pid: number; pinned: boolean; inFlight: number; done: number; restarts?: number; ready?: boolean }
type Stats = {
  machine?: { cpu: string; physicalCores: number; logicalThreads: number; ramGB: number; os: string; node: string; hybridCpu: boolean; maxDbConnections: number }
  startedAt?: number
  managerPid?: number
  simulating?: boolean
  defaultWorkers?: number
  messagesSent?: number
  messagesReceived?: number
  recoveredTasks?: number
  peakBusyWorkers?: number
  messages?: Msg[]
  cores: number
  logical: number
  perWorkerCapacity: number
  queue: number
  maxQueue: number
  workers: Worker[]
  cpu: { t: number; perCore: number[]; perLogical: number[]; queue: number; inFlight: number[] }[]
}
type Msg = { t: number; from: string; to: string; kind: 'task' | 'result' | 'ready' | 'exit'; id?: number; text: string }
type Sim = { status: string; lines?: string[]; message?: string }

function useServerStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  useEffect(() => {
    let stop = false
    let timer: number | undefined
    const tick = async () => {
      try {
        const res = await fetch(`${SERVER}/stats`, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as Stats
        if (!stop) { setStats(data); setOnline(true) }
      } catch {
        if (!stop) setOnline(false)
      }
      if (!stop) timer = window.setTimeout(tick, 1000)
    }
    void tick()
    return () => { stop = true; window.clearTimeout(timer) }
  }, [])
  return { stats, online }
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
const uptime = (since: number) => {
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h} h ${m} min` : m ? `${m} min ${s % 60} s` : `${s} s`
}

export default function SystemWorkers() {
  const { stats, online } = useServerStats()
  const live = online && stats
  const machine = live && stats.machine ? stats.machine : { ...bench.machine, physicalCores: null as number | null }
  const totalDone = live ? stats.workers.reduce((s, w) => s + w.done, 0) : 0
  const working = live ? stats.workers.reduce((s, w) => s + w.inFlight, 0) : 0
  const lastCpu = live ? stats.cpu[stats.cpu.length - 1] : undefined

  return (
    <>
      <div className={`sys-status ${live ? 'is-live' : online === false ? 'is-off' : ''}`} role="status">
        <span className="sys-dot" />
        {online === null ? 'Connecting to the booking server on this laptop…'
          : live ? <>Live from the booking server on this laptop · running {stats.startedAt ? uptime(stats.startedAt) : ''} · updates every second</>
          : <>The booking server is not running on this laptop. Showing the benchmark measured on {new Date(bench.date).toLocaleDateString()}.</>}
      </div>

      <div className="kpi-grid">
        <StatCard icon={<Cpu size={16} weight="bold" />} tone="green" label="Processor" value={live && stats.machine ? `${stats.machine.physicalCores} cores` : `${bench.machine.logicalThreads} threads`}
          note={machine.cpu} />
        <StatCard icon={<HardDrives size={16} weight="bold" />} tone="gold" label="Worker processes" value={live ? stats.cores : '—'}
          note={live ? `${stats.cores === stats.defaultWorkers ? 'measured best on this laptop' : 'set by WORKERS'} · ${machine.physicalCores ?? ''} cores available` : '2 by default · start the server to see them'} />
        <StatCard icon={<Memory size={16} weight="bold" />} tone="cream" label="Memory (RAM)" value={`${machine.ramGB} GB`} note={machine.os} />
        <StatCard icon={<UsersThree size={16} weight="bold" />} tone="gold" label="Bookings handled" value={live ? totalDone.toLocaleString() : '—'}
          note={live ? `${working} in progress now · ${stats.queue} waiting` : 'since the server started'} />
      </div>

      <div className="admin-card">
        <div className="card-heading"><div><h2>How a booking is processed</h2><p className="eyebrow">Parallel workers, one per CPU core, sharing the work</p></div></div>
        <div className="sys-flow">
          <div className="sys-node">
            <UsersThree size={22} weight="duotone" />
            <strong>Customers</strong>
            <small>Many customers send booking requests at the same moment (simulated here)</small>
          </div>
          <ArrowRight className="sys-arrow" size={20} />
          <div className="sys-node is-manager">
            <HardDrives size={22} weight="duotone" />
            <strong>Manager process</strong>
            <small>{live ? `pid ${stats.managerPid ?? '—'} · ` : ''}receives every request and sends it at once to the least-busy worker</small>
            {live && <span className="sys-chip">waiting: {stats.queue} · most ever: {stats.maxQueue}</span>}
          </div>
          <ArrowRight className="sys-arrow" size={20} />
          <div className="sys-workers">
            {live ? stats.workers.map(w => (
              <div key={w.worker} className={`sys-worker ${w.inFlight ? 'is-busy' : ''}`}>
                <div className="sys-worker-head"><strong>Worker {w.worker}</strong><span>{w.ready === false ? 'restarting' : w.inFlight ? 'working' : 'idle'}</span></div>
                <small>pid {w.pid} · {w.pinned ? `pinned to core ${w.core}` : 'core chosen by Windows'}{w.restarts ? ` · restarted ${w.restarts}×` : ''}</small>
                <div className="sys-worker-num"><b>{w.done.toLocaleString()}</b> handled <em>{pct(w.done, totalDone)}%</em></div>
                <div className="sys-bar"><i style={{ width: `${pct(w.done, totalDone)}%` }} /></div>
                <small>now: {w.inFlight} booking{w.inFlight === 1 ? '' : 's'} · up to {stats.perWorkerCapacity} database connections</small>
                <StopWorker worker={w.worker} disabled={w.ready === false} />
              </div>
            )) : <div className="sys-worker is-empty"><strong>Workers</strong><small>Each worker is a separate process on its own core. Start the server to watch them.</small></div>}
          </div>
          <ArrowRight className="sys-arrow" size={20} />
          <div className="sys-node">
            <Database size={22} weight="duotone" />
            <strong>Database</strong>
            <small>Locks the caterer's date so only one customer gets it, then saves the booking</small>
          </div>
        </div>
      </div>

      {live && lastCpu && (
        <div className="admin-card">
          <div className="card-heading"><div><h2>CPU use right now</h2><p className="eyebrow">{stats.logical} logical threads on {machine.cpu}</p></div></div>
          <div className="sys-cpu">
            {lastCpu.perLogical.map((v, i) => (
              <div key={i} className="sys-cpu-col" title={`Thread ${i + 1}: ${v}%`}>
                <div className="sys-cpu-track"><i style={{ height: `${Math.max(2, v)}%` }} /></div>
                <small>{v}%</small><span>T{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {live && <Simulator busy={Boolean(stats.simulating)} />}

      <AppQrCard />

      <div className="admin-card">
        <div className="card-heading"><div><h2>Measured on this laptop</h2>
          <p className="eyebrow">{bench.machine.cpu} · {bench.machine.logicalThreads} threads · {bench.machine.ramGB} GB RAM · {new Date(bench.date).toLocaleDateString()} · average of {bench.runsPerSize} runs</p></div></div>
        <div className="table-wrap"><table className="rich-table">
          <thead><tr><th>Workers</th><th>Customers at once</th><th>Bookings per second</th><th>Typical wait</th><th>Slowest 5%</th><th>How the work was split</th><th>Double bookings</th></tr></thead>
          <tbody>{bench.rows.map(r => (
            <tr key={`${r.workers}-${r.customers}`}>
              <td><strong>{r.workers}</strong></td>
              <td>{r.customers.toLocaleString()}</td>
              <td>{r.throughput}</td>
              <td>{(r.p50Ms / 1000).toFixed(2)} s</td>
              <td>{(r.p95Ms / 1000).toFixed(2)} s</td>
              <td className="sys-split">{Object.entries(r.perWorker as Record<string, number>).map(([w, n]) => <span key={w}>W{w}: {n}</span>)}</td>
              <td>{r.doubleBooked === 0 && r.consistent ? <span className="status approved">0</span> : <span className="status rejected">{r.doubleBooked}</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="sys-note">One booking at a time (no parallel workers): {bench.sequential.throughput} bookings per second, {bench.sequential.meanMs} ms each.
          Every run was checked in the database: no lost and no double-booked dates.</p>
        {!live && online === false && (
          <p className="sys-note">To watch the workers live, open a terminal in the <code>parallel-booking</code> folder on this laptop and run <code>npm run live</code>, then keep this page open. It uses only the local test database, never the live Cuisina data.</p>
        )}
      </div>
    </>
  )
}

function Simulator({ busy }: { busy: boolean }) {
  const [customers, setCustomers] = useState('100')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Sim | null>(null)
  const started = useRef(0)

  async function run(event: FormEvent) {
    event.preventDefault()
    setRunning(true); setResult(null); started.current = Date.now()
    try {
      const res = await fetch(`${SERVER}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'simulate', params: { customers: Number(customers) } }) })
      setResult((await res.json()) as Sim)
    } catch (err) {
      setResult({ status: 'error', message: err instanceof Error ? err.message : 'The booking server did not answer.' })
    } finally { setRunning(false) }
  }

  return (
    <div className="admin-card">
      <div className="card-heading"><div><h2>Try it: many customers book at the same moment</h2>
        <p className="eyebrow">Test customers and caterers in the local test database only. Watch the workers above while it runs.</p></div></div>
      <form className="sys-sim" onSubmit={run}>
        <label>Customers booking at once
          <input type="number" min={1} max={2000} value={customers} onChange={e => setCustomers(e.target.value)} required />
        </label>
        <button className="admin-primary" disabled={running || busy}><Play size={16} weight="fill" /> {running || busy ? 'Running…' : 'Start'}</button>
      </form>
      {result && (
        <div className={result.status === 'ok' ? 'form-notice' : 'form-error'}>
          {result.message && <p>{result.message}</p>}
          {result.lines && <pre className="sys-log">{result.lines.join('\n').trim()}</pre>}
        </div>
      )}
    </div>
  )
}

function StopWorker({ worker, disabled }: { worker: number; disabled: boolean }) {
  const [busy, setBusy] = useState(false)
  async function stop() {
    setBusy(true)
    try {
      await fetch(`${SERVER}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'stopWorker', params: { worker } }) })
    } finally { window.setTimeout(() => setBusy(false), 1500) }
  }
  return (
    <button type="button" className="sys-stop" onClick={() => void stop()} disabled={disabled || busy} title="Crash this worker on purpose: the manager restarts it and nothing is lost">
      <StopCircle size={14} weight="bold" /> {busy ? 'Stopping…' : 'Stop worker'}
    </button>
  )
}
