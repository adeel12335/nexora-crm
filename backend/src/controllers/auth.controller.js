import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { normalisePhone } from '../utils/phone.js';

const MIN_PASSWORD_LENGTH = 8;

function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    whatsappNumber: row.whatsapp_number,
    role: row.role,
    avatarUrl: row.avatar_url,
  };
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function basePayload(user) {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Deactivating someone must actually lock them out, not just hide them from
  // the directory. Checked after the password so this cannot be used to probe
  // which accounts exist.
  if (!user.is_active) {
    return res.status(403).json({ error: 'This account has been deactivated' });
  }

  const token = signToken(basePayload(user));
  res.json({ token, user: toPublicUser(user) });
}

export async function me(req, res) {
  const [[user]] = await pool.query(
    `SELECT id, name, email, phone, whatsapp_number, role, avatar_url, is_active
     FROM users WHERE id = ?`,
    [req.user.id],
  );
  if (!user) return res.status(404).json({ error: 'User not found' });

  // An already-issued token stays valid until it expires, so a session that was
  // open when the account was deactivated is cut off here on its next check.
  if (!user.is_active) {
    return res.status(403).json({ error: 'This account has been deactivated' });
  }

  const body = { user: toPublicUser(user) };
  if (req.user.impersonatorId) {
    body.impersonating = {
      id: req.user.impersonatorId,
      name: req.user.impersonatorName || 'Admin',
    };
  }

  res.set('Cache-Control', 'private, max-age=30');
  res.json(body);
}

/**
 * POST /api/auth/switch-user — admin becomes the target user (WP-style).
 * JWT acts as the target; impersonatorId keeps a path back to the admin.
 */
export async function switchUser(req, res) {
  if (req.user.impersonatorId) {
    return res.status(403).json({ error: 'Already switched — switch back first' });
  }

  const userId = Number(req.body?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot switch to yourself' });
  }

  const [[target]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!target.is_active) {
    return res.status(403).json({ error: 'Cannot switch to a deactivated account' });
  }

  const [[admin]] = await pool.query(
    'SELECT id, name, role, is_active FROM users WHERE id = ?',
    [req.user.id],
  );
  if (!admin || !admin.is_active || admin.role !== 'admin') {
    return res.status(403).json({ error: 'Only an active admin can switch users' });
  }

  const token = signToken({
    ...basePayload(target),
    impersonatorId: admin.id,
    impersonatorName: admin.name,
  });

  res.json({
    token,
    user: toPublicUser(target),
    impersonating: { id: admin.id, name: admin.name },
  });
}

/**
 * POST /api/auth/switch-back — leave impersonation and restore the admin session.
 */
export async function switchBack(req, res) {
  const adminId = req.user.impersonatorId;
  if (!adminId) {
    return res.status(400).json({ error: 'Not currently switched to another user' });
  }

  const [[admin]] = await pool.query('SELECT * FROM users WHERE id = ?', [adminId]);
  if (!admin) return res.status(404).json({ error: 'Original admin account not found' });
  if (!admin.is_active) {
    return res.status(403).json({ error: 'Original admin account has been deactivated' });
  }
  if (admin.role !== 'admin') {
    return res.status(403).json({ error: 'Original account is no longer an admin' });
  }

  const token = signToken(basePayload(admin));
  res.json({ token, user: toPublicUser(admin) });
}

/** PATCH /api/auth/me — a user editing their own name / phone / avatar. */
export async function updateProfile(req, res) {
  const [[existing]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const errors = [];

  const name = req.body.name !== undefined ? String(req.body.name).trim() : existing.name;
  if (!name) errors.push('Name is required');
  else if (name.length < 2) errors.push('Name must be at least 2 characters');
  else if (name.length > 120) errors.push('Name must be 120 characters or fewer');

  let phone = existing.phone;
  if (req.body.phone !== undefined) {
    const { value, error } = normalisePhone(req.body.phone);
    if (error) errors.push(`Phone: ${error}`);
    phone = value;
  }

  let whatsappNumber = existing.whatsapp_number;
  if (req.body.whatsappNumber !== undefined) {
    const { value, error } = normalisePhone(req.body.whatsappNumber);
    if (error) errors.push(`WhatsApp number: ${error}`);
    whatsappNumber = value;
  }

  const avatarUrl = req.body.avatarUrl !== undefined ? (req.body.avatarUrl || null) : existing.avatar_url;

  if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });

  await pool.query(
    'UPDATE users SET name = ?, phone = ?, whatsapp_number = ?, avatar_url = ? WHERE id = ?',
    [name, phone, whatsappNumber, avatarUrl, req.user.id]
  );

  const [[updated]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: toPublicUser(updated) });
}

/** POST /api/auth/change-password — a user changing their own password. */
export async function changePassword(req, res) {
  if (req.user.impersonatorId) {
    return res.status(403).json({ error: 'Cannot change password while switched to another user' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return res.status(400).json({ error: 'New password must contain at least one letter and one number' });
  }

  const [[existing]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, existing.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
  res.json({ ok: true });
}
