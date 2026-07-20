import { Icon } from '../../icons/IconSprite.jsx';

const CHANNEL_LABEL = { whatsapp: 'WhatsApp', email: 'Email', app: 'In-app' };
const CHANNEL_ICON = { whatsapp: 'i-whatsapp', email: 'i-mail', app: 'i-bell' };

export default function AlertItem({ alert, unread }) {
  return (
    <div className={`alert-item${unread ? ' unread' : ''}`}>
      <div className={`alert-icon tone-${alert.tone}`}><Icon id={alert.icon} /></div>
      <div className="alert-body">
        <strong>{alert.title}</strong>
        <p>{alert.body}</p>
      </div>
      <div className="alert-meta">
        <span className={`channel-badge ${alert.channel}`}>
          <Icon id={CHANNEL_ICON[alert.channel]} />{CHANNEL_LABEL[alert.channel]}
        </span>
        <time>{alert.time}</time>
      </div>
    </div>
  );
}
