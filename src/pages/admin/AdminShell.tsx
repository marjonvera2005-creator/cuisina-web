import { Bell, CalendarCheck, ChartBar, ClockCounterClockwise, Coins, Flag, TextAa, Gear, SealCheck, SquaresFour, Tag, Users } from '@phosphor-icons/react'
import { PortalGate } from '../../components/PortalGate'
import { PortalLayout } from '../../components/PortalLayout'
import type { NavItem } from '../../components/PortalLayout'
import { useAuth } from '../../lib/auth'
import { db } from '../../lib/supabase'
import { useLiveRefresh } from '../../lib/useLiveRefresh'
import { useQuery } from '../../lib/useQuery'

export default function AdminShell() {
  return (
    <PortalGate role="administrator" title="Administrator portal" subtitle="Sign in with a securely assigned administrator account.">
      <AdminNav />
    </PortalGate>
  )
}

function AdminNav() {
  const { userId } = useAuth()
  const counts = useQuery(async () => {
    const [pending, complaints] = await Promise.all([
      db().from('catering_businesses').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
      db().from('complaints').select('id', { count: 'exact', head: true }).in('status', ['open', 'reviewing']),
    ])
    return { pending: pending.count ?? 0, complaints: complaints.count ?? 0 }
  }, [userId])
  // New application or complaint (notification): update the badges at once.
  useLiveRefresh(userId, counts.reload)

  const items: NavItem[] = [
    { to: '/admin', label: 'Overview', icon: SquaresFour, end: true },
    { to: '/admin/verification', label: 'Business verification', icon: SealCheck, badge: counts.data?.pending ?? 0 },
    { to: '/admin/bookings', label: 'All bookings', icon: CalendarCheck },
    { to: '/admin/reports', label: 'Reports', icon: ChartBar },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/complaints', label: 'Complaints', icon: Flag, badge: counts.data?.complaints ?? 0 },
    { to: '/admin/categories', label: 'Event categories', icon: Tag, group: 'Platform settings', groupIcon: Gear },
    { to: '/admin/business-model', label: 'Business model', icon: Coins, group: 'Platform settings' },
    { to: '/admin/audit', label: 'Audit log', icon: ClockCounterClockwise, group: 'Platform settings' },
    { to: '/admin/display', label: 'Accessibility & display', icon: TextAa },
    // Reached from the bell in the header.
    { to: '/admin/notifications', label: 'Notifications', icon: Bell, hidden: true },
  ]
  return <PortalLayout portalName="Administrator Portal" items={items} />
}
