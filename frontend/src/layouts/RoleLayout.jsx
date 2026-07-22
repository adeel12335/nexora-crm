import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import Sidebar from '../components/AppShell/Sidebar.jsx';
import Topbar from '../components/AppShell/Topbar.jsx';
import { roles } from '../config/roleNavConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import { AttendanceProvider } from '../hooks/useAttendanceSession.jsx';
import { api } from '../api/client.js';

export default function RoleLayout({ roleKey }) {
  const { user, token, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = roles[roleKey];
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [alertsCount, setAlertsCount] = useState(0);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const sync = () => setMobileNav(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!token) {
      setAlertsCount(0);
      return undefined;
    }
    let cancelled = false;
    async function refresh() {
      try {
        const data = await api.notificationsUnreadCount(token);
        if (!cancelled) setAlertsCount(Number(data.unread || 0));
      } catch {
        if (!cancelled) setAlertsCount(0);
      }
    }
    refresh();
    const id = setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    if (mobileNav) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen, mobileNav]);

  if (loading && !user) {
    return (
      <div className="app-boot" role="status" aria-live="polite">
        <div className="app-boot-card">
          <div className="app-boot-spinner" aria-hidden="true" />
          <p>Loading portal…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== roleKey) return <Navigate to={`/${user.role}`} replace />;

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const shell = (
    <div className="app-shell">
      <Sidebar role={role} user={user} onLogout={handleLogout} open={sidebarOpen} mobile={mobileNav} onNavigate={() => setSidebarOpen(false)} onClose={() => setSidebarOpen(false)} />
      <main className="workspace">
        <Topbar role={role} user={user} onLogout={handleLogout} alertsCount={alertsCount} menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen((open) => !open)} />
        <Outlet context={{ role, user }} />
      </main>
      <button
        className={`scrim${sidebarOpen ? ' visible' : ''}`}
        type="button"
        aria-label="Close navigation"
        aria-hidden={!sidebarOpen}
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={() => setSidebarOpen(false)}
      />
    </div>
  );

  const needsAttendance = roleKey === 'agent' || roleKey === 'manager';
  return needsAttendance ? <AttendanceProvider>{shell}</AttendanceProvider> : shell;
}

export function useRoleContext() {
  return useOutletContext();
}
