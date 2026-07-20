import { Link } from 'react-router-dom';
import { Icon } from '../../icons/IconSprite.jsx';

function useGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', emoji: '👋' };
  if (hour < 18) return { text: 'Good afternoon', emoji: '👋' };
  return { text: 'Good evening', emoji: '🌙' };
}

export default function Topbar({ role, user, onLogout, title, subtitle, onMenuClick, menuOpen = false, alertsCount = 0 }) {
  const greeting = useGreeting();
  const firstName = user.name.split(' ')[0];

  return (
    <header className="topbar">
      <button className="icon-btn mobile-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={onMenuClick}>
        <Icon id="i-menu" />
      </button>
      <div className="welcome">
        <h1>{title ?? `${greeting.text}, ${firstName}!`} <span>{greeting.emoji}</span></h1>
        <p>{subtitle ?? "Here's what's happening in your portal today."}</p>
      </div>
      <div className="top-actions">
        <Link to={`${role.basePath}/notifications`} className={`icon-btn${alertsCount ? ' has-badge' : ''}`} aria-label="Notifications">
          <Icon id="i-bell" />
          {alertsCount > 0 && <b>{alertsCount}</b>}
        </Link>
        <button className="top-avatar" aria-label="Sign out" onClick={onLogout}>
          <img src={user.avatarUrl || '/assets/avatar-jane.svg'} alt={user.name} />
        </button>
      </div>
    </header>
  );
}
