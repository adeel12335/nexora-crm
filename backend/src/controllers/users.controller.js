import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';

const VALID_ROLES = ['admin', 'manager', 'agent', 'production'];

function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

export async function listUsers(req, res) {
  const { role } = req.query;
  let sql = 'SELECT * FROM users';
  const params = [];

  if (role) {
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    sql += ' WHERE role = ?';
    params.push(role);
  }
  sql += ' ORDER BY id ASC';

  const [rows] = await pool.query(sql, params);
  res.json({ users: rows.map(toPublicUser) });
}

export async function getUser(req, res) {
  const [[row]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ user: toPublicUser(row) });
}

export async function createUser(req, res) {
  const { name, email, password, role, avatarUrl } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password and role are required' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, avatar_url) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, role, avatarUrl || null]
    );
    const [[row]] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    res.status(201).json({ user: toPublicUser(row) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    throw err;
  }
}

export async function updateUser(req, res) {
  const { name, email, role, avatarUrl, password } = req.body;
  const { id } = req.params;

  const [[existing]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  if (role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const fields = {
    name: name ?? existing.name,
    email: email ?? existing.email,
    role: role ?? existing.role,
    avatar_url: avatarUrl ?? existing.avatar_url,
    password_hash: password ? await bcrypt.hash(password, 10) : existing.password_hash,
  };

  try {
    await pool.query(
      'UPDATE users SET name = ?, email = ?, role = ?, avatar_url = ?, password_hash = ? WHERE id = ?',
      [fields.name, fields.email, fields.role, fields.avatar_url, fields.password_hash, id]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    throw err;
  }

  const [[row]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  res.json({ user: toPublicUser(row) });
}

export async function deleteUser(req, res) {
  const { id } = req.params;

  if (Number(id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
  res.status(204).send();
}
