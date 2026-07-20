import { useCallback, useEffect, useState } from 'react';
import AlertItem from '../../components/notifications/AlertItem.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const CHANNELS = [
  { id: 'all', label: 'All' },
  { id: 'app', label: 'In-app' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
];

export default function NotificationsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [channel, setChannel] = useState('all');
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api.listNotifications(token, {
      channel: channel === 'all' ? undefined : channel,
      limit: 80,
    });
    setAlerts(data.notifications || []);
    setUnread(Number(data.unread || 0));
  }, [token, channel]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (err) {
        if (!cancelled) {
          showToast(err.message || 'Failed to load notifications');
          setAlerts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, load, showToast]);

  async function handleOpen(alert) {
    if (!alert.unread) return;
    try {
      await api.markNotificationRead(token, alert.id);
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, unread: false } : a)));
      setUnread((n) => Math.max(0, n - 1));
    } catch (err) {
      showToast(err.message || 'Could not mark as read');
    }
  }

  async function handleMarkAll() {
    setBusy(true);
    try {
      await api.markAllNotificationsRead(token);
      setAlerts((prev) => prev.map((a) => ({ ...a, unread: false })));
      setUnread(0);
      showToast('All notifications marked as read');
    } catch (err) {
      showToast(err.message || 'Failed to mark all read');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Notifications &amp; Alerts</h2>
          <p>
            Real alerts from attendance, WhatsApp, and system events
            {unread ? ` · ${unread} unread` : ''}.
          </p>
        </div>
        <button
          type="button"
          className="tool-btn"
          disabled={busy || !unread}
          onClick={handleMarkAll}
        >
          Mark all read
        </button>
      </div>

      <div className="alert-toolbar">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={channel === c.id ? 'active' : ''}
            onClick={() => setChannel(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="alert-list">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : alerts.length ? (
          alerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              unread={alert.unread}
              onOpen={() => handleOpen(alert)}
            />
          ))
        ) : (
          <div className="empty-state">No notifications yet</div>
        )}
      </div>
    </section>
  );
}
