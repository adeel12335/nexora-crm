import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { isValidEmail, normalisePhone } from '../utils/phone.js';
import {
  USER_RATE_SUBQUERY,
  MANAGER_RATE_SUBQUERY,
  currentMonthKey,
  getUserRate,
  isValidMonth,
  setUserRate,
  setManagerRate,
  clearManagerRates,
  toMonthStart,
} from '../utils/commissionRates.js';
import { isValidPercentage, money, validateRates } from '../utils/commission.js';

const VALID_ROLES = ['admin', 'manager', 'agent', 'production'];
// Only these roles sell, so only they carry a commission rate or a manager.
const EARNING_ROLES = ['agent', 'manager'];
const MIN_PASSWORD_LENGTH = 8;

function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    whatsappNumber: row.whatsapp_number,
    role: row.role,
    managerId: row.manager_id,
    managerName: row.manager_name ?? null,
    commissionPercentage: Number(row.commission_percentage ?? 0),
    // null = never configured for this pair; different from an explicit 0%.
    managerCutPercentage:
      row.manager_cut === null || row.manager_cut === undefined ? null : Number(row.manager_cut),
    mailboxCount: row.mailbox_count === undefined ? undefined : Number(row.mailbox_count),
    isActive: Boolean(row.is_active),
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

const USER_LIST_COLUMNS = `
  u.id, u.name, u.email, u.phone, u.whatsapp_number, u.role, u.manager_id,
  u.is_active, u.avatar_url, u.created_at
`;

function userSelect(monthStart) {
  return {
    sql: `
      SELECT ${USER_LIST_COLUMNS}, m.name AS manager_name,
             ${USER_RATE_SUBQUERY} AS commission_percentage,
             ${MANAGER_RATE_SUBQUERY} AS manager_cut,
             (SELECT COUNT(*) FROM mailboxes mb WHERE mb.user_id = u.id) AS mailbox_count
      FROM users u
      LEFT JOIN users m ON m.id = u.manager_id
    `,
    // Both rate subqueries take the same month start.
    params: [monthStart, monthStart],
  };
}

/** Lean list for pickers (id/name only) — skips rates, mailboxes, and role counts. */
function userSelectLite() {
  return {
    sql: `SELECT u.id, u.name, u.email, u.role, u.is_active FROM users u`,
    params: [],
  };
}

/** Walks up manager_id so an assignment can never form a loop. */
async function wouldCycle(userId, managerId) {
  let cursor = managerId;
  const seen = new Set([Number(userId)]);
  while (cursor) {
    if (seen.has(Number(cursor))) return true;
    seen.add(Number(cursor));
    const [[row]] = await pool.query('SELECT manager_id FROM users WHERE id = ?', [cursor]);
    if (!row) return false;
    cursor = row.manager_id;
  }
  return false;
}

/**
 * Shared field validation for create and update.
 * `existing` is null on create. Returns { errors, values }.
 */
async function validateUserPayload(body, existing) {
  const errors = [];
  const values = {};
  const isCreate = existing === null;

  // --- name ---
  if (body.name !== undefined || isCreate) {
    const name = String(body.name ?? '').trim();
    if (!name) errors.push('Name is required');
    else if (name.length < 2) errors.push('Name must be at least 2 characters');
    else if (name.length > 120) errors.push('Name must be 120 characters or fewer');
    values.name = name;
  } else {
    values.name = existing.name;
  }

  // --- email ---
  if (body.email !== undefined || isCreate) {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email) errors.push('Email is required');
    else if (!isValidEmail(email)) errors.push('Enter a valid email address');
    values.email = email;
  } else {
    values.email = existing.email;
  }

  // --- password (required on create, optional on update) ---
  if (isCreate || body.password) {
    const password = String(body.password ?? '');
    if (!password) {
      errors.push('Password is required');
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      errors.push('Password must contain at least one letter and one number');
    }
    values.password = password;
  }

  // --- role ---
  if (body.role !== undefined || isCreate) {
    const role = String(body.role ?? '').trim();
    if (!VALID_ROLES.includes(role)) {
      errors.push(`Role must be one of: ${VALID_ROLES.join(', ')}`);
    }
    values.role = role;
  } else {
    values.role = existing.role;
  }

  // --- phone / whatsapp ---
  for (const [field, label] of [['phone', 'Phone'], ['whatsappNumber', 'WhatsApp number']]) {
    if (body[field] !== undefined) {
      const { value, error } = normalisePhone(body[field]);
      if (error) errors.push(`${label}: ${error}`);
      values[field] = value;
    } else {
      values[field] = isCreate ? null : field === 'phone' ? existing.phone : existing.whatsapp_number;
    }
  }

  // --- commission (stored in user_commission_rates, not on users) ---
  if (body.commissionPercentage !== undefined) {
    if (!isValidPercentage(body.commissionPercentage)) {
      errors.push('Commission must be a number between 0 and 100 with at most 2 decimals');
      values.commissionPercentage = 0;
    } else {
      values.commissionPercentage = money(Number(body.commissionPercentage));
      if (!EARNING_ROLES.includes(values.role) && values.commissionPercentage > 0) {
        errors.push(`${values.role} users do not earn commission — set it to 0`);
      }
    }
    values.commissionTouched = true;
  } else {
    values.commissionPercentage = null;
    values.commissionTouched = false;
  }

  // Month the rate applies from. Defaults to the current month so a change
  // never silently rewrites earlier months' figures.
  if (body.commissionMonth !== undefined && body.commissionMonth !== null && body.commissionMonth !== '') {
    if (!isValidMonth(body.commissionMonth)) {
      errors.push('commissionMonth must look like YYYY-MM');
    }
    values.commissionMonth = body.commissionMonth;
  } else {
    values.commissionMonth = currentMonthKey();
  }

  // --- manager ---
  if (body.managerId !== undefined) {
    if (body.managerId === null || body.managerId === '') {
      values.managerId = null;
    } else {
      const managerId = Number(body.managerId);
      if (!Number.isInteger(managerId)) {
        errors.push('managerId must be a user id');
      } else if (existing && managerId === existing.id) {
        errors.push('A user cannot report to themselves');
      } else {
        const [[manager]] = await pool.query('SELECT id, role FROM users WHERE id = ?', [managerId]);
        if (!manager) errors.push('The selected manager does not exist');
        else if (manager.role !== 'manager') errors.push('The selected user is not a manager');
        else if (existing && (await wouldCycle(existing.id, managerId))) {
          errors.push('That assignment would create a reporting cycle');
        }
      }
      values.managerId = managerId;
    }
    if (values.managerId && !EARNING_ROLES.includes(values.role)) {
      errors.push(`${values.role} users are not assigned to a manager`);
    }
  } else {
    values.managerId = isCreate ? null : existing.manager_id;
  }

  // --- active flag ---
  values.isActive = body.isActive === undefined ? (isCreate ? 1 : existing.is_active) : body.isActive ? 1 : 0;
  values.avatarUrl = body.avatarUrl === undefined ? (isCreate ? null : existing.avatar_url) : body.avatarUrl || null;

  return { errors, values };
}

async function fetchUser(id, monthKey = currentMonthKey()) {
  const monthStart = toMonthStart(monthKey);
  const { sql, params } = userSelect(monthStart);
  const [[row]] = await pool.query(`${sql} WHERE u.id = ?`, [...params, id]);
  return row ? toPublicUser(row) : null;
}

/**
 * GET /api/users?role=&search=&includeInactive=&month=&page=&pageSize=&lite=
 * Omit pageSize (or pass 0) to return every match — used by mailboxes / manager pickers.
 * Pass lite=1 for a lean id/name list (no rates, mailboxes, or role counts).
 */
export async function listUsers(req, res) {
  const { role, search, includeInactive, month } = req.query;
  const lite = req.query.lite === '1' || req.query.lite === 'true';
  const monthKey = month || currentMonthKey();
  if (!lite && !isValidMonth(monthKey)) {
    return res.status(400).json({ error: 'month must look like YYYY-MM' });
  }
  const monthStart = lite ? null : toMonthStart(monthKey);

  const page = Math.max(1, Number(req.query.page) || 1);
  const rawSize = req.query.pageSize === undefined ? 0 : Number(req.query.pageSize);
  const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(100, Math.floor(rawSize)) : 0;

  const where = [];
  const filterParams = [];

  if (role) {
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    where.push('u.role = ?');
    filterParams.push(role);
  }
  if (search) {
    where.push('(u.name LIKE ? OR u.email LIKE ?)');
    filterParams.push(`%${search}%`, `%${search}%`);
  }
  if (includeInactive !== 'true') where.push('u.is_active = 1');

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const counts = { total: 0, admin: 0, manager: 0, agent: 0, production: 0 };
  let total;

  if (lite) {
    // Pickers only need a total for pagination metadata; skip role breakdown.
    const [[{ total: n }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u ${clause}`,
      filterParams
    );
    total = Number(n);
    counts.total = total;
  } else {
    // Role totals for the stats cards — same filters, no pagination.
    const [countRows] = await pool.query(
      `SELECT u.role, COUNT(*) AS count FROM users u ${clause} GROUP BY u.role`,
      filterParams
    );
    for (const row of countRows) {
      const n = Number(row.count);
      counts[row.role] = n;
      counts.total += n;
    }
    total = counts.total;
  }

  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = pageSize > 0 ? Math.min(page, totalPages) : 1;

  const { sql, params: rateParams } = lite ? userSelectLite() : userSelect(monthStart);
  let listSql = lite
    ? `${sql} ${clause} ORDER BY u.name`
    : `${sql} ${clause} ORDER BY FIELD(u.role,'admin','manager','agent','production'), u.name`;
  const listParams = [...rateParams, ...filterParams];
  if (pageSize > 0) {
    listSql += ' LIMIT ? OFFSET ?';
    listParams.push(pageSize, (safePage - 1) * pageSize);
  }

  const [rows] = await pool.query(listSql, listParams);
  res.json({
    month: monthKey,
    users: rows.map(toPublicUser),
    counts,
    pagination: {
      page: safePage,
      pageSize: pageSize || total,
      total,
      totalPages,
    },
  });
}

/** GET /api/users/:id */
export async function getUser(req, res) {
  const user = await fetchUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}

/** POST /api/users */
export async function createUser(req, res) {
  const { errors, values } = await validateUserPayload(req.body, null);
  if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });

  const passwordHash = await bcrypt.hash(values.password, 10);

  let insertId;
  try {
    const [result] = await pool.query(
      `INSERT INTO users
        (name, email, phone, whatsapp_number, password_hash, role, manager_id,
         is_active, avatar_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        values.name, values.email, values.phone, values.whatsappNumber, passwordHash,
        values.role, values.managerId, values.isActive, values.avatarUrl,
      ]
    );
    insertId = result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    throw err;
  }

  if (values.commissionTouched && values.commissionPercentage > 0) {
    await setUserRate({
      userId: insertId,
      month: values.commissionMonth,
      percentage: values.commissionPercentage,
      actorId: req.user.id,
    });
  }

  if (values.managerId && req.body.managerCutPercentage !== undefined && req.body.managerCutPercentage !== '') {
    const cut = Number(req.body.managerCutPercentage);
    const cutErrors = validateRates({
      agentPercentage: values.commissionPercentage ?? 0,
      managerPercentage: cut,
    });
    if (cutErrors.length) return res.status(400).json({ error: cutErrors.join('; ') });
    await setManagerRate({
      managerId: values.managerId,
      agentId: insertId,
      month: values.commissionMonth,
      percentage: cut,
      actorId: req.user.id,
    });
  }

  res.status(201).json({ user: await fetchUser(insertId) });
}

/** PATCH /api/users/:id */
export async function updateUser(req, res) {
  const { id } = req.params;

  const [[existing]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  // Locking yourself out of the portal is almost never intended.
  if (Number(id) === req.user.id && req.body.isActive === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }
  if (Number(id) === req.user.id && req.body.role && req.body.role !== existing.role) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }

  const { errors, values } = await validateUserPayload(req.body, existing);
  if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });

  const passwordHash = values.password
    ? await bcrypt.hash(values.password, 10)
    : existing.password_hash;

  try {
    await pool.query(
      `UPDATE users SET name = ?, email = ?, phone = ?, whatsapp_number = ?, password_hash = ?,
         role = ?, manager_id = ?, is_active = ?, avatar_url = ?
       WHERE id = ?`,
      [
        values.name, values.email, values.phone, values.whatsappNumber, passwordHash,
        values.role, values.managerId, values.isActive, values.avatarUrl, id,
      ]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    throw err;
  }

  if (values.commissionTouched) {
    await setUserRate({
      userId: id,
      month: values.commissionMonth,
      percentage: values.commissionPercentage,
      actorId: req.user.id,
    });
  }

  // Manager moved — drop cuts that belonged to the previous manager.
  if (Number(existing.manager_id) !== Number(values.managerId ?? 0)) {
    if (existing.manager_id) {
      await clearManagerRates(existing.manager_id, id);
    }
  }

  if (values.managerId && req.body.managerCutPercentage !== undefined && req.body.managerCutPercentage !== '') {
    const cut = Number(req.body.managerCutPercentage);
    const own = values.commissionTouched
      ? values.commissionPercentage
      : await getUserRate(id, values.commissionMonth);
    const cutErrors = validateRates({ agentPercentage: own, managerPercentage: cut });
    if (cutErrors.length) return res.status(400).json({ error: cutErrors.join('; ') });
    await setManagerRate({
      managerId: values.managerId,
      agentId: Number(id),
      month: values.commissionMonth,
      percentage: cut,
      actorId: req.user.id,
    });
  }

  res.json({ user: await fetchUser(id) });
}

/**
 * DELETE /api/users/:id
 * Deactivates by default; ?hard=true removes the row (and cascades mailboxes).
 */
export async function deleteUser(req, res) {
  const { id } = req.params;
  const hard = req.query.hard === 'true';

  if (Number(id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const [[existing]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  if (existing.role === 'admin') {
    const [[{ count }]] = await pool.query(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?",
      [id]
    );
    if (count === 0) {
      return res.status(400).json({ error: 'This is the last active admin — promote someone else first' });
    }
  }

  const [[{ reports }]] = await pool.query(
    'SELECT COUNT(*) AS reports FROM users WHERE manager_id = ?',
    [id]
  );
  if (reports > 0) {
    return res.status(409).json({
      error: `${existing.name} still has ${reports} team member${reports === 1 ? '' : 's'} — reassign them first`,
    });
  }

  if (hard) {
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return res.status(204).send();
  }

  await pool.query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
  res.json({ user: await fetchUser(id) });
}
