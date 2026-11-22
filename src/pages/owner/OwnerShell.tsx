import { Bell, CalendarBlank, CalendarCheck, ChartBar, Flower, ForkKnife, Lifebuoy, Package, PlusCircle, SquaresFour, Star, Storefront, TextAa } from '@phosphor-icons/react'
import { PortalGate } from '../../components/PortalGate'
import { PortalLayout } from '../../components/PortalLayout'
import type { NavItem } from '../../components/PortalLayout'
import { useAuth } from '../../lib/auth'
import { db } from '../../lib/supabase'
import { useLiveRefresh } from '../../lib/useLiveRefresh'
import { useQuery } from '../../lib/useQuery'

export default function OwnerShell() {
  return (
    <PortalGate role="owner" title="Caterer portal" subtitle="Sign in to manage your packages and booking requests." allowSignUp>
      <OwnerNav />
    </PortalGate>
  )
}

function OwnerNav() {
  const { userId } = useAuth()
  const pending = useQuery(async () => {
    // New requests plus change requests: everything in Bookings that waits for the caterer's answer.
    const [bookings, changes] = await Promise.all([
      db().from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db().from('booking_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ])
    return (bookings.count ?? 0) + (changes.count ?? 0)
  }, [userId])
  // New booking request (notification) or any booking status change: update the badge at once.
  useLiveRefresh(userId, pending.reload, ['bookings'])

  const items: NavItem[] = [
    { to: '/owner', label: 'Dashboard', icon: SquaresFour, end: true },
    { to: '/owner/bookings', label: 'Bookings', icon: CalendarCheck, badge: pending.data ?? 0 },
    { to: '/owner/calendar', label: 'Calendar', icon: CalendarBlank },
    { to: '/owner/packages', label: 'Packages', icon: Package },
    { to: '/owner/styling', label: 'Designs & styling', icon: Flower, group: 'Menu & offerings', groupIcon: ForkKnife },
    { to: '/owner/addons', label: 'Add-ons', icon: PlusCircle, group: 'Menu & offerings' },
    { to: '/owner/reports', label: 'Reports', icon: ChartBar },
    { to: '/owner/reviews', label: 'Reviews', icon: Star },
    { to: '/owner/business', label: 'Business profile', icon: Storefront },
    { to: '/owner/support', label: 'Help & support', icon: Lifebuoy },
    { to: '/owner/display', label: 'Accessibility & display', icon: TextAa },
    // Reached from the bell in the header.
    { to: '/owner/notifications', label: 'Notifications', icon: Bell, hidden: true },
  ]
  return <PortalLayout portalName="Caterer Portal" items={items} greeting="Here’s an overview of your catering business." />
}
