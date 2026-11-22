import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Minus } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

import { SERIES_COLORS } from '../lib/charts'

export function StatCard({ icon, tone, label, value, trend, note, to }: {
  /** A drawn icon (Phosphor), never a text glyph. */
  icon: ReactNode
  tone: 'gold' | 'green' | 'cream'
  label: string
  value: ReactNode
  /** Positive is shown as up, negative as down; null hides the trend. */
  trend?: { delta: number; text: string } | null
  note?: string
  /** When set, the card links to this page (arrow in the corner). */
  to?: string
}) {
  return (
    <article className={to ? 'kpi-card linked' : 'kpi-card'}>
      <span className={`kpi-icon ${tone}`} aria-hidden="true">{icon}</span>
      <div className="kpi-body">
        <h3 className="kpi-label">{label}</h3>
        <strong className="kpi-value">{value}</strong>
        {trend && (
          <small className={`kpi-trend ${trend.delta > 0 ? 'up' : trend.delta < 0 ? 'down' : ''}`}>
            {trend.delta > 0 ? <ArrowUp size={14} weight="bold" aria-hidden="true" /> : trend.delta < 0 ? <ArrowDown size={14} weight="bold" aria-hidden="true" /> : <Minus size={14} weight="bold" aria-hidden="true" />}
            {trend.text}
          </small>
        )}
        {note && <small className="kpi-note">{note}</small>}
      </div>
      {to && <Link to={to} className="kpi-go" aria-label={`Open ${label}`}><ArrowRight size={16} weight="bold" /></Link>}
    </article>
  )
}

/** Single-series line over time with a crosshair tooltip. */
export function LineChart({ points, label, format = String, showValues = false, fill = false }: {
  points: { label: string; value: number }[]
  label: string
  format?: (value: number) => string
  /** Print each value above its point. */
  showValues?: boolean
  /** Grow taller to fill the space its parent gives it (text keeps the same size). */
  fill?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState<number | null>(null)
  useEffect(() => {
    if (!fill || !box.current) return
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      if (w > 0 && h > 0) setRatio(h / w)
    })
    observer.observe(box.current)
    return () => observer.disconnect()
  }, [fill])
  const width = 560, height = fill && ratio ? Math.max(210, Math.round(560 * ratio)) : 210, left = 36, right = 16, top = showValues ? 26 : 14, bottom = 28
  const max = Math.max(1, ...points.map(point => point.value))
  const niceMax = Math.ceil(max / 4) * 4 || 4
  const x = (i: number) => left + (points.length <= 1 ? 0 : (i * (width - left - right)) / (points.length - 1))
  const y = (value: number) => top + (1 - value / niceMax) * (height - top - bottom)
  const path = points.map((point, i) => `${i ? 'L' : 'M'}${x(i)},${y(point.value)}`).join(' ')
  const area = `${path} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
  const ticks = [0, niceMax / 2, niceMax]

  return (
    <div className={fill ? 'line-chart fill' : 'line-chart'} ref={box}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${points.map(p => `${p.label} ${format(p.value)}`).join(', ')}`}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="line-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLORS[0]} stopOpacity=".22" />
            <stop offset="100%" stopColor={SERIES_COLORS[0]} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map(tick => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="grid-line" />
            <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="axis-text">{format(tick)}</text>
          </g>
        ))}
        <path d={area} fill="url(#line-fill)" />
        <path d={path} fill="none" stroke={SERIES_COLORS[0]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={y(0)} className="crosshair" />}
        {points.map((point, i) => (
          <g key={point.label}>
            <circle cx={x(i)} cy={y(point.value)} r={hover === i ? 6 : 5} fill={SERIES_COLORS[0]} stroke="#fffdf8" strokeWidth="2" />
            <text x={x(i)} y={height - 8} textAnchor="middle" className="axis-text">{point.label}</text>
            {showValues && <text x={x(i)} y={y(point.value) - 11} textAnchor="middle" className="point-value">{format(point.value)}</text>}
            {/* Wide invisible hit area per point. */}
            <rect x={x(i) - (width - left - right) / Math.max(1, points.length - 1) / 2} y={top} height={height - top - bottom}
              width={(width - left - right) / Math.max(1, points.length - 1)} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / width) * 100}%`, top: `${(y(points[hover].value) / height) * 100}%` }}>
          <b>{format(points[hover].value)}</b> {points[hover].label}
        </div>
      )}
    </div>
  )
}

/** Share of a whole, up to five slices; legend lists every slice with count and percent. */
export function DonutChart({ slices, centerLabel }: {
  slices: { label: string; value: number }[]
  centerLabel: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const radius = 54, stroke = 20, circumference = 2 * Math.PI * radius
  const gap = slices.filter(s => s.value > 0).length > 1 ? 2 : 0
  let offset = 0

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={slices.map(s => `${s.label} ${s.value}`).join(', ')}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#efeadb" strokeWidth={stroke} />
        {total > 0 && slices.map((slice, i) => {
          const length = (slice.value / total) * circumference
          const dash = Math.max(0, length - gap)
          const element = slice.value > 0 && (
            <circle key={slice.label} cx="70" cy="70" r={radius} fill="none" stroke={SERIES_COLORS[i]}
              strokeWidth={stroke} strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset} transform="rotate(-90 70 70)"
              opacity={hover != null && hover !== i ? 0.35 : 1}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ transition: 'opacity .15s' }} />
          )
          offset += length
          return element
        })}
        <text x="70" y="68" textAnchor="middle" className="donut-total">{hover != null ? slices[hover].value : total}</text>
        <text x="70" y="86" textAnchor="middle" className="axis-text">{hover != null ? slices[hover].label : centerLabel}</text>
      </svg>
      <ul className="donut-legend">
        {slices.map((slice, i) => (
          <li key={slice.label} className={hover === i ? 'active' : ''} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: SERIES_COLORS[i] }} />
            <span>{slice.label}</span>
            <b>{total ? Math.round((slice.value / total) * 100) : 0}% · {slice.value}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?'
  return <span className="mini-avatar">{initials}</span>
}
