import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url,
  };
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

  const payload = { id: user.id, role: user.role, name: user.name, email: user.email };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  res.json({ token, user: toPublicUser(user) });
}

export async function me(req, res) {
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // An already-issued token stays valid until it expires, so a session that was
  // open when the account was deactivated is cut off here on its next check.
  if (!user.is_active) {
    return res.status(403).json({ error: 'This account has been deactivated' });
  }

  res.json({ user: toPublicUser(user) });
}
