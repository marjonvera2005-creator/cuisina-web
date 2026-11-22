import { Link } from 'react-router-dom'
import { emptyIcon, IconTile } from './IconTile'

export function Logo({ className = '', to = '/owner' }: { className?: string; to?: string }) {
  return (
    <Link className={`brand ${className}`.trim()} to={to} aria-label="Cuisina home">
      <img className="brand-logo" src={`${import.meta.env.BASE_URL}cuisina-logo.png`} alt="" width={44} height={44} /><span>Cuisina</span>
    </Link>
  )
}

/** Sidebar wordmark: the gold cloche over a script "Cuisina" and the tagline. */
export function StackedLogo({ to = '/owner' }: { to?: string }) {
  return (
    <Link className="stacked-logo" to={to} aria-label="Cuisina home">
      <img src={`${import.meta.env.BASE_URL}cuisina-cloche.png`} alt="" width={76} height={60} />
      <strong>Cuisina</strong>
      <small>Catering Made Easier</small>
    </Link>
  )
}

/** Decorative leafy sprig (drawn, single color via currentColor). */
export function LeafSprig({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 160" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M58 158 C60 120 66 82 84 44 C92 28 100 16 108 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M84 44 C70 36 60 40 54 52 C68 58 78 54 84 44 Z" />
      <path d="M84 44 C92 30 104 28 112 34 C104 46 94 50 84 44 Z" />
      <path d="M74 70 C58 66 48 74 46 88 C60 90 70 84 74 70 Z" />
      <path d="M74 70 C84 56 98 56 104 64 C96 76 84 78 74 70 Z" />
      <path d="M66 100 C50 98 40 108 40 122 C54 122 64 114 66 100 Z" />
      <path d="M66 100 C74 86 88 84 96 92 C88 104 76 106 66 100 Z" />
      <path d="M100 14 C96 4 100 -2 108 -2 C110 6 106 12 100 14 Z" />
    </svg>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status}`}>{status.replace(/_/g, ' ')}</span>
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  const isLoading = title.startsWith("Loading")
  return (
    <div className={`empty-state${isLoading ? " is-loading" : ""}`} role={isLoading ? "status" : undefined}>
      {isLoading ? <CuisinaLoader /> : <IconTile {...emptyIcon(title)} size="lg" />}
      <strong>{title}</strong>{children && <p>{children}</p>}
    </div>
  )
}

/** Loading animation: the Cuisina cloche inside a turning gold ring, with three steam dots. */
export function CuisinaLoader({ size = 64 }: { size?: number }) {
  return (
    <span className="cuisina-loader" style={{ width: size, height: size }} aria-hidden="true">
      <span className="cuisina-loader-ring" />
      <img src={`${import.meta.env.BASE_URL}cuisina-cloche.png`} alt="" />
      <span className="cuisina-loader-steam"><i /><i /><i /></span>
    </span>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return <div className="form-error admin-error" role="alert">{message}</div>
}

export function NotConfigured() {
  return (
    <main className="admin-setup">
      <div>
        <p className="eyebrow">Configuration required</p>
        <h1>Supabase is not connected</h1>
        <p>Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to <code>web/.env.local</code>, then restart the dev server.</p>
      </div>
    </main>
  )
}
