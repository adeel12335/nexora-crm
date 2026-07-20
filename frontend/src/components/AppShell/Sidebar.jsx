import { NavLink, Link } from 'react-router-dom';
import { Icon } from '../../icons/IconSprite.jsx';

export default function Sidebar({ role, user, onLogout, open, onNavigate }) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Primary navigation">
      <Link to={role.basePath} className="brand">
        <img src="/assets/logo.svg" alt="Nexora logo" />
        <div><strong>NEXORA</strong><span>{role.label.toUpperCase()} PORTAL</span></div>
      </Link>

      <nav className="side-nav">
        {role.nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onNavigate}
          >
            <Icon id={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="plan-card">
          <div className="plan-icon"><Icon id="i-shield" /></div>
          <div className="plan-copy"><strong>Signed in — live auth</strong><span>Attendance/production data still mock</span></div>
        </div>
        <button className="profile-card" onClick={onLogout} aria-label="Sign out">
          <img src={user.avatarUrl || '/assets/avatar-jane.svg'} alt={user.name} />
          <span><strong>{user.name}</strong><small>{role.label}</small></span>
          <Icon id="i-logout" />
        </button>
      </div>
    </aside>
  );
}
