import { useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import Sidebar from '../components/AppShell/Sidebar.jsx';
import Topbar from '../components/AppShell/Topbar.jsx';
import { roles } from '../config/roleNavConfig.js';
import { getAllAlerts } from '../data/mockData.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function RoleLayout({ roleKey }) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = roles[roleKey];
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const alertsCount = getAllAlerts().length;

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== roleKey) return <Navigate to={`/${user.role}`} replace />;

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <Sidebar role={role} user={user} onLogout={handleLogout} open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <main className="workspace">
        <Topbar role={role} user={user} onLogout={handleLogout} alertsCount={alertsCount} onMenuClick={() => setSidebarOpen(true)} />
        <Outlet context={{ role, user }} />
      </main>
      <div className={`scrim${sidebarOpen ? ' visible' : ''}`} onClick={() => setSidebarOpen(false)} />
    </div>
  );
}

export function useRoleContext() {
  return useOutletContext();
}
