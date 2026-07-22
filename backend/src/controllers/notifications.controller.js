import { pool } from '../config/db.js';

function formatRelativeTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function toAlert(row) {
  return {
    id: row.id,
    type: row.type,
    tone: row.tone,
    icon: row.icon,
    channel: row.channel,
    title: row.title,
    body: row.body,
    relatedCardId: row.related_card_id,
    unread: !row.is_read,
    createdAt: row.created_at,
    time: formatRelativeTime(row.created_at),
  };
}

/**
 * GET /api/notifications?channel=&limit=
 * Returns the current user's notifications (newest first).
 */
export async function listNotifications(req, res) {
  const channel = req.query.channel ? String(req.query.channel) : 'all';
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const params = [req.user.id];
  let where = 'user_id = ?';

  if (channel && channel !== 'all') {
    if (!['app', 'whatsapp', 'email'].includes(channel)) {
      return res.status(400).json({ error: 'channel must be all, app, whatsapp, or email' });
    }
    where += ' AND channel = ?';
    params.push(channel);
  }

  const [rows] = await pool.query(
    `SELECT * FROM notifications
     WHERE ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [...params, limit]
  );

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(is_read = 0) AS unread
     FROM notifications
     WHERE user_id = ?`,
    [req.user.id]
  );

  res.json({
    notifications: rows.map(toAlert),
    total: Number(countRow?.total || 0),
    unread: Number(countRow?.unread || 0),
  });
}

/** GET /api/notifications/unread-count */
export async function unreadCount(req, res) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0`,
    [req.user.id]
  );
  res.set('Cache-Control', 'private, max-age=15');
  res.json({ unread: Number(row?.unread || 0) });
}

/** PATCH /api/notifications/:id/read */
export async function markRead(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid notification id' });
  }

  const [result] = await pool.query(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
    [id, req.user.id]
  );
  if (!result.affectedRows) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  res.json({ ok: true });
}

/** POST /api/notifications/read-all */
export async function markAllRead(req, res) {
  const [result] = await pool.query(
    `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
    [req.user.id]
  );
  res.json({ ok: true, updated: result.affectedRows });
}
