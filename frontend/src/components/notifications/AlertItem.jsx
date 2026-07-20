import { Icon } from '../../icons/IconSprite.jsx';

const CHANNEL_LABEL = { whatsapp: 'WhatsApp', email: 'Email', app: 'In-app' };
const CHANNEL_ICON = { whatsapp: 'i-whatsapp', email: 'i-mail', app: 'i-bell' };

export default function AlertItem({ alert, unread, onOpen }) {
  const channel = alert.channel || 'app';
  const Comp = onOpen ? 'button' : 'div';

  return (
    <Comp
      type={onOpen ? 'button' : undefined}
      className={`alert-item${unread ? ' unread' : ''}${onOpen ? ' alert-item-clickable' : ''}`}
      onClick={onOpen}
    >
      <div className={`alert-icon tone-${alert.tone || 'blue'}`}>
        <Icon id={alert.icon || 'i-bell'} />
      </div>
      <div className="alert-body">
        <strong>{alert.title}</strong>
        <p>{alert.body}</p>
      </div>
      <div className="alert-meta">
        <span className={`channel-badge ${channel}`}>
          <Icon id={CHANNEL_ICON[channel] || 'i-bell'} />
          {CHANNEL_LABEL[channel] || channel}
        </span>
        <time>{alert.time || ''}</time>
      </div>
    </Comp>
  );
}
