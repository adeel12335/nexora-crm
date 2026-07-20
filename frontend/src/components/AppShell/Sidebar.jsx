import { NavLink, Link } from 'react-router-dom';
import { Icon } from '../../icons/IconSprite.jsx';
import StickyCheckIn from '../attendance/StickyCheckIn.jsx';

export default function Sidebar({ role, user, onLogout, open, mobile, onNavigate, onClose }) {
  const showCheckIn = user.role === 'agent' || user.role === 'manager';

  return (
    <aside id="primary-navigation" className={`sidebar${open ? ' open' : ''}`} aria-label="Primary navigation" aria-hidden={mobile ? !open : undefined} inert={mobile && !open ? '' : undefined}>
      <button type="button" className="sidebar-close" aria-label="Close menu" onClick={onClose}>
        <Icon id="i-close" />
      </button>
      <Link to={role.basePath} className="brand">
        <img src="/assets/logo.webp" alt="The Wiki Studio logo" />
        <div><span>{role.label.toUpperCase()} PORTAL</span></div>
      </Link>

        {showCheckIn && (
          <div className="sidebar-checkin-slot">
            <StickyCheckIn />
          </div>
        )}

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
        <button className="profile-card" onClick={onLogout} aria-label="Sign out">
          <img src={user.avatarUrl || '/assets/avatar-jane.svg'} alt={user.name} />
          <span><strong>{user.name}</strong><small>{role.label}</small></span>
          <Icon id="i-logout" />
        </button>
      </div>
    </aside>
  );
}
