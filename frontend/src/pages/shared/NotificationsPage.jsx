import { useState } from 'react';
import AlertItem from '../../components/notifications/AlertItem.jsx';
import { getAllAlerts } from '../../data/mockData.js';

const CHANNELS = [
  { id: 'all', label: 'All' },
  { id: 'app', label: 'In-app' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
];

export default function NotificationsPage() {
  const [channel, setChannel] = useState('all');
  const alerts = getAllAlerts();
  const filtered = channel === 'all' ? alerts : alerts.filter((a) => a.channel === channel);

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Notifications &amp; Alerts</h2>
          <p>Production deadline alerts and attendance rule triggers, auto-sent in-app, via WhatsApp, and by email.</p>
        </div>
      </div>

      <div className="alert-toolbar">
        {CHANNELS.map((c) => (
          <button key={c.id} className={channel === c.id ? 'active' : ''} onClick={() => setChannel(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="alert-list">
        {filtered.length
          ? filtered.map((alert, i) => <AlertItem key={alert.id} alert={alert} unread={i < 2} />)
          : <div className="empty-state">No alerts on this channel</div>}
      </div>
    </section>
  );
}
