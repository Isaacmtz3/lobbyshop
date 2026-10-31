import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { useAuth } from './contexts/AuthContext'
import { consumePendingNext } from './lib/pendingNext'
import { ClientDashboard } from './pages/ClientDashboard'
import { CommandCenter } from './pages/CommandCenter'
import { ForgotPassword } from './pages/ForgotPassword'
import { KioskCheckIn } from './pages/KioskCheckIn'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { OwnerOnboarding } from './pages/OwnerOnboarding'
import { PrivacyPolicy } from './pages/PrivacyPolicy'
import { ResetPassword } from './pages/ResetPassword'
import { ShopDetail } from './pages/ShopDetail'
import { ShopDirectory } from './pages/ShopDirectory'
import { ShopDisplay } from './pages/ShopDisplay'
import { SignUp } from './pages/SignUp'
import { TermsOfService } from './pages/TermsOfService'

/** Shop pages accept a shop owner OR the platform admin — the admin is the
 * one exception to shop isolation, and he also owns a shop, so his single
 * login needs both seats. */
function RequireRole({ roles, children }: { roles: ('shop_owner' | 'admin')[]; children: React.ReactNode }) {
  const { user, profile, loading, profileLoading } = useAuth()
  if (loading || (user && profileLoading)) {
    return <div className="mx-auto max-w-3xl px-5 py-10 text-mute">Loading…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  if (!profile || !roles.includes(profile.role as 'shop_owner' | 'admin')) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Unlisted admin-only route. Unlike RequireRole, a non-admin visitor is
 * bounced to "/" with no explanation — this route's existence isn't
 * something to confirm to someone who isn't supposed to be here. */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading } = useAuth()
  if (loading || (user && profileLoading)) {
    return <div className="flex min-h-screen items-center justify-center bg-void text-mute">Loading…</div>
  }
  if (!user || profile?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

/** "/" is the marketing landing page for new visitors, but a returning
 * signed-in user should never see a signup funnel again — send them
 * straight to the part of the app their role actually uses. Clients land
 * on their dashboard (favorites, recent shops, loyalty); browse stays a
 * tab/link from there, not the landing page. */
function RootRoute() {
  const { user, profile, loading, profileLoading } = useAuth()
  if (loading || (user && profileLoading)) {
    return <div className="flex min-h-screen items-center justify-center bg-void text-mute">Loading…</div>
  }
  if (user) {
    // Email-confirmation round trip may land back on "/" instead of the
    // shop page — send the fresh account straight there to finish checking in.
    const pending = consumePendingNext()
    if (pending) return <Navigate to={pending} replace />
    if (profile?.role === 'shop_owner') return <Navigate to="/owner" replace />
    if (profile?.role === 'admin') return <Navigate to="/command-center" replace />
    return <Navigate to="/dashboard" replace />
  }
  return <Landing />
}

/** /dashboard is the client home. Owners/admins who land here directly
 * are sent to their own homes instead of seeing a client dashboard. */
function ClientDashboardRoute() {
  const { user, profile, loading, profileLoading } = useAuth()
  if (loading || (user && profileLoading)) {
    return <div className="mx-auto max-w-3xl px-5 py-10 text-mute">Loading…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role === 'shop_owner') return <Navigate to="/owner" replace />
  if (profile?.role === 'admin') return <Navigate to="/command-center" replace />
  return <ClientDashboard />
}

function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-void">
      <NavBar />
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="border-t border-line px-5 py-5 text-center text-xs text-mute">
        <Link to="/terms" className="hover:text-bone hover:underline">
          Terms of Service
        </Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:text-bone hover:underline">
          Privacy Policy
        </Link>
        <span className="mx-2">·</span>
        <a href="mailto:iceemtz3@gmail.com" className="hover:text-bone hover:underline">
          Contact
        </a>
      </footer>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/kiosk/:slug" element={<KioskCheckIn />} />
      <Route path="/display/:slug" element={<ShopDisplay />} />

      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<ClientDashboardRoute />} />
        <Route path="/browse" element={<ShopDirectory />} />
        <Route path="/shop/:slug" element={<ShopDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route
          path="/owner"
          element={
            <RequireRole roles={['shop_owner', 'admin']}>
              <OwnerOnboarding />
            </RequireRole>
          }
        />
        <Route
          path="/command-center"
          element={
            <RequireAdmin>
              <CommandCenter />
            </RequireAdmin>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
