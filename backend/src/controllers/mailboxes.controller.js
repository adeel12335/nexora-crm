import { pool } from '../config/db.js';
import { isValidEmail } from '../utils/phone.js';

// Only people who actually send outreach keep mailboxes.
const MAILBOX_ROLES = ['agent', 'manager'];

function toMailbox(row) {
  return {
    id: row.id,
    userId: row.user_id,
    ownerName: row.owner_name ?? null,
    emailAddress: row.email_address,
    label: row.label,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

const MAILBOX_SELECT = `
  SELECT mb.*, u.name AS owner_name
  FROM mailboxes mb
  JOIN users u ON u.id = mb.user_id
`;

/**
 * Who the caller is allowed to act on.
 * Admin: anyone. Manager: themselves and their own agents. Agent: themselves.
 */
async function canManage(actor, targetUserId) {
  if (actor.role === 'admin') return true;
  if (Number(targetUserId) === actor.id) return true;

  if (actor.role === 'manager') {
    const [[target]] = await pool.query('SELECT manager_id FROM users WHERE id = ?', [targetUserId]);
    return Boolean(target) && Number(target.manager_id) === actor.id;
  }
  return false;
}

/**
 * GET /api/mailboxes?userId=
 * Without userId: an admin sees every mailbox, a manager sees their team's,
 * anyone else sees their own.
 */
export async function listMailboxes(req, res) {
  const { userId } = req.query;

  if (userId) {
    if (!(await canManage(req.user, userId))) {
      return res.status(403).json({ error: "You cannot view this user's mailboxes" });
    }
    const [rows] = await pool.query(`${MAILBOX_SELECT} WHERE mb.user_id = ? ORDER BY mb.id`, [userId]);
    return res.json({ mailboxes: rows.map(toMailbox) });
  }

  if (req.user.role === 'admin') {
    const [rows] = await pool.query(`${MAILBOX_SELECT} ORDER BY u.name, mb.id`);
    return res.json({ mailboxes: rows.map(toMailbox) });
  }

  if (req.user.role === 'manager') {
    const [rows] = await pool.query(
      `${MAILBOX_SELECT} WHERE mb.user_id = ? OR u.manager_id = ? ORDER BY u.name, mb.id`,
      [req.user.id, req.user.id]
    );
    return res.json({ mailboxes: rows.map(toMailbox) });
  }

  const [rows] = await pool.query(`${MAILBOX_SELECT} WHERE mb.user_id = ? ORDER BY mb.id`, [req.user.id]);
  res.json({ mailboxes: rows.map(toMailbox) });
}

/** POST /api/mailboxes */
export async function createMailbox(req, res) {
  const { emailAddress, label } = req.body;
  // An agent may only add to their own list; admins/managers may pass userId.
  const userId = req.body.userId ?? req.user.id;

  const errors = [];
  const email = String(emailAddress ?? '').trim().toLowerCase();

  if (!email) errors.push('Email address is required');
  else if (!isValidEmail(email)) errors.push('Enter a valid email address');

  if (label !== undefined && label !== null && String(label).length > 100) {
    errors.push('Label must be 100 characters or fewer');
  }
  if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });

  if (!(await canManage(req.user, userId))) {
    return res.status(403).json({ error: 'You cannot add a mailbox for this user' });
  }

  const [[owner]] = await pool.query('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!owner) return res.status(400).json({ error: 'That user does not exist' });
  if (!MAILBOX_ROLES.includes(owner.role)) {
    return res
      .status(400)
      .json({ error: `Only ${MAILBOX_ROLES.join(' and ')} users keep mailboxes (got ${owner.role})` });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO mailboxes (user_id, email_address, label) VALUES (?, ?, ?)',
      [userId, email, label ? String(label).trim() : null]
    );
    const [[row]] = await pool.query(`${MAILBOX_SELECT} WHERE mb.id = ?`, [result.insertId]);
    res.status(201).json({ mailbox: toMailbox(row) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This mailbox is already registered for that user' });
    }
    throw err;
  }
}

/** PATCH /api/mailboxes/:id — edit address/label/status, or reassign to another user. */
export async function updateMailbox(req, res) {
  const { id } = req.params;
  const { emailAddress, label, isActive, userId } = req.body;

  const [[existing]] = await pool.query('SELECT * FROM mailboxes WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Mailbox not found' });

  if (!(await canManage(req.user, existing.user_id))) {
    return res.status(403).json({ error: 'You cannot edit this mailbox' });
  }

  let email = existing.email_address;
  if (emailAddress !== undefined) {
    email = String(emailAddress).trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (label !== undefined && label !== null && String(label).length > 100) {
    return res.status(400).json({ error: 'Label must be 100 characters or fewer' });
  }

  let nextUserId = existing.user_id;
  if (userId !== undefined && Number(userId) !== Number(existing.user_id)) {
    if (!(await canManage(req.user, userId))) {
      return res.status(403).json({ error: 'You cannot assign this mailbox to that user' });
    }
    const [[owner]] = await pool.query('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!owner) return res.status(400).json({ error: 'That user does not exist' });
    if (!MAILBOX_ROLES.includes(owner.role)) {
      return res
        .status(400)
        .json({ error: `Only ${MAILBOX_ROLES.join(' and ')} users keep mailboxes (got ${owner.role})` });
    }
    nextUserId = owner.id;
  }

  try {
    await pool.query(
      'UPDATE mailboxes SET user_id = ?, email_address = ?, label = ?, is_active = ? WHERE id = ?',
      [
        nextUserId,
        email,
        label === undefined ? existing.label : label ? String(label).trim() : null,
        isActive === undefined ? existing.is_active : isActive ? 1 : 0,
        id,
      ]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This mailbox is already registered for that user' });
    }
    throw err;
  }

  const [[row]] = await pool.query(`${MAILBOX_SELECT} WHERE mb.id = ?`, [id]);
  res.json({ mailbox: toMailbox(row) });
}

/** DELETE /api/mailboxes/:id */
export async function deleteMailbox(req, res) {
  const { id } = req.params;

  const [[existing]] = await pool.query('SELECT * FROM mailboxes WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Mailbox not found' });

  if (!(await canManage(req.user, existing.user_id))) {
    return res.status(403).json({ error: 'You cannot remove this mailbox' });
  }

  await pool.query('DELETE FROM mailboxes WHERE id = ?', [id]);
  res.status(204).send();
}
