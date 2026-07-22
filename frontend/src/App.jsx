import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import IconSprite from './icons/IconSprite.jsx';
import PwaInstallBanner from './components/PwaInstallBanner.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import RoleLayout from './layouts/RoleLayout.jsx';

const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/shared/NotificationsPage.jsx'));
const ProfilePage = lazy(() => import('./pages/shared/ProfilePage.jsx'));
const TeamAttendancePage = lazy(() => import('./pages/shared/TeamAttendancePage.jsx'));
const ProductionBoardPage = lazy(() => import('./pages/shared/ProductionBoardPage.jsx'));
const MailboxesPage = lazy(() => import('./pages/shared/MailboxesPage.jsx'));
const PortfolioPage = lazy(() => import('./pages/shared/PortfolioPage.jsx'));
const CommissionEarningsPage = lazy(() => import('./pages/shared/CommissionEarningsPage.jsx'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.jsx'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage.jsx'));
const ClientsPage = lazy(() => import('./pages/admin/ClientsPage.jsx'));

const ManagerDashboard = lazy(() => import('./pages/manager/ManagerDashboard.jsx'));
const TeamCommission = lazy(() => import('./pages/manager/TeamCommission.jsx'));

const AgentDashboard = lazy(() => import('./pages/agent/AgentDashboard.jsx'));
const AgentAttendance = lazy(() => import('./pages/agent/AgentAttendance.jsx'));

const ProductionDashboard = lazy(() => import('./pages/production/ProductionDashboard.jsx'));

function PageFallback() {
  return (
    <div className="app-boot" role="status" aria-live="polite">
      <div className="app-boot-card">
        <div className="app-boot-spinner" aria-hidden="true" />
        <p>Loading…</p>
      </div>
    </div>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading && !user) return <PageFallback />;
  return <Navigate to={user ? `/${user.role}` : '/login'} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <IconSprite />
      <PwaInstallBanner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<LoginPage />} />

              <Route path="/admin" element={<RoleLayout roleKey="admin" />}>
                <Route index element={<AdminDashboard />} />
                <Route path="attendance" element={<TeamAttendancePage />} />
                <Route path="production" element={<ProductionBoardPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="clients" element={<ClientsPage />} />
                <Route path="commissions" element={<CommissionEarningsPage />} />
                <Route path="mailboxes" element={<MailboxesPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>

              <Route path="/manager" element={<RoleLayout roleKey="manager" />}>
                <Route index element={<ManagerDashboard />} />
                <Route path="attendance" element={<TeamAttendancePage />} />
                <Route path="clients" element={<ClientsPage />} />
                <Route path="portfolio" element={<PortfolioPage />} />
                <Route path="commissions" element={<TeamCommission />} />
                <Route path="earnings" element={<CommissionEarningsPage />} />
                <Route path="mailboxes" element={<MailboxesPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>

              <Route path="/agent" element={<RoleLayout roleKey="agent" />}>
                <Route index element={<AgentDashboard />} />
                <Route path="attendance" element={<AgentAttendance />} />
                <Route path="clients" element={<ClientsPage />} />
                <Route path="portfolio" element={<PortfolioPage />} />
                <Route path="earnings" element={<CommissionEarningsPage />} />
                <Route path="mailboxes" element={<MailboxesPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>

              <Route path="/production" element={<RoleLayout roleKey="production" />}>
                <Route index element={<ProductionDashboard />} />
                <Route path="board" element={<ProductionBoardPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
