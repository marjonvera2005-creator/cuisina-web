import { useEffect, useRef, useState } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { ArrowLeft, Bell, CaretDoubleLeft, CaretDoubleRight, CaretDown, SignOut } from '@phosphor-icons/react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { db } from '../lib/supabase'
import { LeafSprig, Logo, StackedLogo } from './Brand'
import { toast } from '../lib/toast'
import { onUnreadChanged } from '../lib/unread'

/**
 * `group` puts consecutive items under one collapsible heading.
 * `hidden` keeps a page out of the sidebar (reached another way, e.g. the header bell) but still names the header.
 */
export type NavItem = { to: string; label: string; icon: Icon; end?: boolean; badge?: number; group?: string; groupIcon?: Icon; hidden?: boolean }

/** Line icon that fades to the solid one when its page is open. */
function NavIcon({ icon: Glyph }: { icon: Icon }) {
  return <i className="nav-icon" aria-hidden="true"><Glyph size={20} /><Glyph size={20} weight="fill" /></i>
}

const isActivePath = (item: NavItem, path: string) => (item.end ? path === item.to : path === item.to || path.startsWith(`${item.to}/`))

// UNMARSHALLING: JSON.parse turns the saved text back into a list of open sidebar groups.
function readOpenGroups(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[] } catch { return [] }
}

function SidebarNav({ items, storageKey, collapsed }: { items: NavItem[]; storageKey: string; collapsed: boolean }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState<string[]>(() => readOpenGroups(storageKey))

  function toggle(group: string) {
    setOpen(current => {
      const next = current.includes(group) ? current.filter(g => g !== group) : [...current, group]
      // MARSHALLING: JSON.stringify turns the list into text so it can be saved in localStorage.
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* storage unavailable: still works for this visit */ }
      return next
    })
  }

  const link = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}
      title={collapsed ? item.label : undefined} aria-label={collapsed ? item.label : undefined}>
      <span><NavIcon icon={item.icon} /></span> <em className="nav-label">{item.label}</em>{item.badge ? <b>{item.badge}</b> : null}
    </NavLink>
  )

  // Consecutive items with the same group become one section; ungrouped items render as plain links.
  const blocks: (NavItem | { group: string; items: NavItem[] })[] = []
  // Collapsed sidebar: icons only, so every page is one click away (no group headings).
  if (collapsed) return <nav>{items.filter(i => !i.hidden).map(link)}</nav>
  for (const item of items.filter(i => !i.hidden)) {
    const last = blocks[blocks.length - 1]
    if (item.group && last && 'items' in last && last.group === item.group) last.items.push(item)
    else blocks.push(item.group ? { group: item.group, items: [item] } : item)
  }

  return (
    <nav>
      {blocks.map(block => {
        if (!('items' in block)) return link(block)
        const containsActive = block.items.some(item => isActivePath(item, pathname))
        const expanded = containsActive || open.includes(block.group)
        const badge = block.items.reduce((sum, item) => sum + (item.badge ?? 0), 0)
        const id = `nav-${block.group.replace(/\W+/g, '-').toLowerCase()}`
        return (
          <div key={block.group} className={`nav-group${expanded ? ' open' : ''}${containsActive ? ' has-active' : ''}`}>
            <button type="button" className="nav-group-toggle" aria-expanded={expanded} aria-controls={id}
              onClick={() => toggle(block.group)} disabled={containsActive} title={containsActive ? 'Contains the current page' : undefined}>
              <span><NavIcon icon={block.items[0].groupIcon ?? block.items[0].icon} /></span> {block.group}
              {!expanded && badge > 0 && <b>{badge}</b>}
              <CaretDown className="chevron" size={14} weight="bold" aria-hidden="true" />
            </button>
            <div className="nav-group-body" id={id}>
              <div>{block.items.map(link)}</div>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

type Props = {
  portalName: string
  items: NavItem[]
  /** Second line of the home-page welcome banner. */
  greeting?: string
}

/** The signed-in person's menu in the header: notifications, profile, log out. */
function UserMenu({ initial, firstName, base, onLogout }: { initial: string; firstName: string; base: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span className="admin-avatar">{initial}</span><span className="user-name">{firstName}</span><CaretDown size={14} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div className="user-dropdown" role="menu">
          <Link role="menuitem" to={`${base}/notifications`} onClick={() => setOpen(false)}>Notifications</Link>
          {base === '/owner' && <Link role="menuitem" to="/owner/business" onClick={() => setOpen(false)}>Business profile</Link>}
          <Link role="menuitem" to={`${base}/display`} onClick={() => setOpen(false)}>Accessibility &amp; display</Link>
          <button role="menuitem" type="button" onClick={onLogout}>Log out</button>
        </div>
      )}
    </div>
  )
}

export function PortalLayout({ portalName, items, greeting = 'Here’s what’s happening on Cuisina today.' }: Props) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  // Counts up when something new arrives: the bell swings once.
  const [ring, setRing] = useState(0)
  // Sidebar folded to icons only; remembered in this browser.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('cuisina-sidebar-collapsed') === '1' } catch { return false } })
  const toggleSidebar = () => setCollapsed(value => {
    try { localStorage.setItem('cuisina-sidebar-collapsed', value ? '0' : '1') } catch { /* storage blocked */ }
    return !value
  })

  useEffect(() => {
    if (!auth.userId) return
    const client = db()
    const userId = auth.userId
    const refresh = () => {
      client.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false)
        .then(({ count }) => setUnread(count ?? 0))
    }
    refresh()
    const channel = client.channel(`portal-notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => {
        refresh()
        if (payload.eventType === 'INSERT') setRing(count => count + 1)
        // A customer changed a booking, or asked to: say so on whatever page is open.
        const row = payload.new as { title?: string; body?: string; type?: string }
        if (payload.eventType === 'INSERT' && row.body && (row.type === 'booking_change' || row.title === 'Booking updated')) toast(row.body, 'info')
      })
      .subscribe()
    // The Notifications page marked something read: count again so both always match.
    const stop = onUnreadChanged(refresh)
    return () => { stop(); void client.removeChannel(channel) }
  }, [auth.userId])

  async function logout() {
    await auth.signOut()
    toast('You are signed out.', 'info')
    navigate(portalName.startsWith('Admin') ? '/admin' : '/owner')
  }

  const location = useLocation()
  const name = auth.fullName || auth.email || 'Account'
  const firstName = name.split(/[\s@]/)[0]
  const initial = name.charAt(0).toUpperCase()
  const base = portalName.startsWith('Admin') ? '/admin' : '/owner'
  const current = [...items].sort((a, b) => b.to.length - a.to.length)
    .find(item => isActivePath(item, location.pathname))
  const isHome = location.pathname === base
  const role = portalName.replace(' Portal', '')
  // Back to the page visited before (e.g. All bookings -> Users -> Back -> All bookings).
  // With no earlier page in this portal (opened by link or just signed in), go to the portal's home.
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(base)
  }

  return (
    <div className={`admin-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="admin-sidebar">
        <button type="button" className="sidebar-toggle" onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'} title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'} aria-expanded={!collapsed}>
          {collapsed ? <CaretDoubleRight size={16} weight="bold" /> : <CaretDoubleLeft size={16} weight="bold" />}
        </button>
        <LeafSprig className="sidebar-leaf top" />
        <LeafSprig className="sidebar-leaf bottom" />
        <StackedLogo to={base} />
        <Logo className="admin-brand" to={base} />
        <div className="sidebar-profile" title={collapsed ? `${name} · ${role}` : undefined}>
          <div className="admin-avatar">{initial}</div>
          <div><strong>{name}</strong><small>{role} · <i>Online</i></small></div>
        </div>
        <SidebarNav items={items} storageKey={`cuisina-nav-${base}`} collapsed={collapsed} />
        <button className="admin-logout" onClick={() => void logout()} title={collapsed ? 'Log out' : undefined}><span><NavIcon icon={SignOut} /></span> <em className="nav-label">Log out</em></button>
      </aside>
      <main className="admin-main">
        {/* Home: a welcome banner. Other pages: the page title. */}
        <header className={`admin-header${isHome ? ' welcome-banner' : ''}`}>
          {isHome && <LeafSprig className="banner-leaf" />}
          <div className="header-title">
            {isHome
              ? <><h1>Welcome back, {firstName}! <span aria-hidden="true">👋</span></h1><p>{greeting}</p></>
              : <div className="header-with-back">
                  <button type="button" className="back-button" onClick={goBack} aria-label="Back to the previous page" title="Back to the previous page">
                    <ArrowLeft size={20} weight="bold" /> <span>Back</span>
                  </button>
                  <h1>{current?.label ?? portalName}</h1>
                </div>}
          </div>
          <div className="header-meta">
            <Link to={`${base}/notifications`} className="bell" aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
              <span key={ring} className={ring ? 'bell-icon ring' : 'bell-icon'}><Bell size={20} weight={unread > 0 ? 'fill' : 'regular'} /></span>
              {unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}
            </Link>
            <UserMenu initial={initial} firstName={firstName} base={base} onLogout={() => void logout()} />
          </div>
        </header>
        {/* key = page path, so each page plays its entrance transition when you open it. */}
        <section className="admin-content page-enter" key={location.pathname}><Outlet /></section>
      </main>
    </div>
  )
}
