import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import IconSprite from './icons/IconSprite.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import RoleLayout from './layouts/RoleLayout.jsx';

import LoginPage from './pages/LoginPage.jsx';
import NotificationsPage from './pages/shared/NotificationsPage.jsx';
import TeamAttendancePage from './pages/shared/TeamAttendancePage.jsx';
import ProductionBoardPage from './pages/shared/ProductionBoardPage.jsx';

import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';

import ManagerDashboard from './pages/manager/ManagerDashboard.jsx';

import AgentDashboard from './pages/agent/AgentDashboard.jsx';
import AgentAttendance from './pages/agent/AgentAttendance.jsx';

import ProductionDashboard from './pages/production/ProductionDashboard.jsx';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? `/${user.role}` : '/login'} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <IconSprite />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />

            <Route path="/admin" element={<RoleLayout roleKey="admin" />}>
              <Route index element={<AdminDashboard />} />
              <Route path="attendance" element={<TeamAttendancePage />} />
              <Route path="production" element={<ProductionBoardPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            <Route path="/manager" element={<RoleLayout roleKey="manager" />}>
              <Route index element={<ManagerDashboard />} />
              <Route path="attendance" element={<TeamAttendancePage />} />
              <Route path="production" element={<ProductionBoardPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="/agent" element={<RoleLayout roleKey="agent" />}>
              <Route index element={<AgentDashboard />} />
              <Route path="attendance" element={<AgentAttendance />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="/production" element={<RoleLayout roleKey="production" />}>
              <Route index element={<ProductionDashboard />} />
              <Route path="board" element={<ProductionBoardPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
