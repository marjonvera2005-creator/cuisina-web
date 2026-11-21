import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import './App.css'
import './portal.css'
import './dashboard.css'
import './motion.css'
import { AuthProvider } from './lib/auth'
import Notifications from './pages/Notifications'
import OwnerShell from './pages/owner/OwnerShell'
import Dashboard from './pages/owner/Dashboard'
import Bookings from './pages/owner/Bookings'
import Packages from './pages/owner/Packages'

import Business from './pages/owner/Business'
import Calendar from './pages/owner/Calendar'
import Support from './pages/owner/Support'
import Addons from './pages/owner/Addons'
import Styling from './pages/owner/Styling'
import Reviews from './pages/owner/Reviews'
import AllBookings from './pages/admin/AllBookings'
import AdminShell from './pages/admin/AdminShell'
import Overview from './pages/admin/Overview'
import Verification from './pages/admin/Verification'
import Users from './pages/admin/Users'
import Complaints from './pages/admin/Complaints'
import Categories from './pages/admin/Categories'
import AuditLog from './pages/admin/AuditLog'
import SystemWorkers from './pages/admin/SystemWorkers'
import BusinessModel from './pages/admin/BusinessModel'
import Reports from './pages/admin/Reports'
import OwnerReports from './pages/owner/Reports'
import DisplaySettingsPage from './components/DisplaySettings'
import { AskDialogHost } from './components/AskDialog'

function ScrollManager() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function NotFound() {
  return <main className="page-wrap"><div className="empty-state"><strong>Page not found</strong><p>Caterers can sign in at <a href={`${import.meta.env.BASE_URL}owner`}>/owner</a>.</p></div></main>
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ScrollManager />
        <Routes>
          <Route index element={<Navigate to="/owner" replace />} />
          <Route path="owner" element={<AuthProvider portal="owner"><OwnerShell /></AuthProvider>}>
            <Route index element={<Dashboard />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="support" element={<Support />} />
            <Route path="packages" element={<Packages />} />
            <Route path="addons" element={<Addons />} />
            <Route path="styling" element={<Styling />} />
            <Route path="availability" element={<Navigate to="/owner/calendar" replace />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="reports" element={<OwnerReports />} />
            <Route path="business" element={<Business />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="display" element={<DisplaySettingsPage />} />
          </Route>
          <Route path="admin" element={<AuthProvider portal="admin"><AdminShell /></AuthProvider>}>
            <Route index element={<Overview />} />
            <Route path="verification" element={<Verification />} />
            <Route path="bookings" element={<AllBookings />} />
            <Route path="users" element={<Users />} />
            <Route path="complaints" element={<Complaints />} />
            <Route path="categories" element={<Categories />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="system" element={<SystemWorkers />} />
            <Route path="business-model" element={<BusinessModel />} />
            <Route path="reports" element={<Reports />} />
            <Route path="display" element={<DisplaySettingsPage />} />
            <Route path="notifications" element={<Notifications />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      <AskDialogHost />
    </BrowserRouter>
  )
}
