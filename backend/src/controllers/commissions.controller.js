import { pool } from '../config/db.js';
import { isValidPercentage, money, validateRates } from '../utils/commission.js';
import {
  USER_RATE_SUBQUERY,
  MANAGER_RATE_SUBQUERY,
  clearManagerRates,
  currentMonthKey,
  getManagerRate,
  getRateHistory,
  getUserRate,
  isValidMonth,
  setManagerRate,
  setUserRate,
  toMonthStart,
} from '../utils/commissionRates.js';

const EARNING_ROLES = ['agent', 'manager'];

function toRateRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    whatsappNumber: row.whatsapp_number,
    isActive: Boolean(row.is_active),
    managerId: row.manager_id,
    managerName: row.manager_name ?? null,
    commissionPercentage: Number(row.commission_percentage ?? 0),
    managerCutPercentage:
      row.manager_cut === null || row.manager_cut === undefined ? null : Number(row.manager_cut),
    month: row.month_key,
  };
}

async function fetchRateRow(userId, monthKey) {
  const monthStart = toMonthStart(monthKey);
  const [[row]] = await pool.query(
    `SELECT u.*, m.name AS manager_name,
            ${USER_RATE_SUBQUERY} AS commission_percentage,
            ${MANAGER_RATE_SUBQUERY} AS manager_cut,
            ? AS month_key
     FROM users u
     LEFT JOIN users m ON m.id = u.manager_id
     WHERE u.id = ?`,
    [monthStart, monthStart, monthKey, userId]
  );
  return row ? toRateRow(row) : null;
}

/** GET /api/commissions/rates?month=YYYY-MM */
export async function listRates(req, res) {
  const monthKey = req.query.month || currentMonthKey();
  if (!isValidMonth(monthKey)) {
    return res.status(400).json({ error: 'month must look like YYYY-MM' });
  }
  const monthStart = toMonthStart(monthKey);

  const [rows] = await pool.query(
    `SELECT u.*, m.name AS manager_name,
            ${USER_RATE_SUBQUERY} AS commission_percentage,
            ${MANAGER_RATE_SUBQUERY} AS manager_cut,
            ? AS month_key
     FROM users u
     LEFT JOIN users m ON m.id = u.manager_id
     WHERE u.is_active = 1
     ORDER BY FIELD(u.role, 'manager', 'agent', 'production', 'admin'), u.name`,
    [monthStart, monthStart, monthKey]
  );
  res.json({ month: monthKey, rates: rows.map(toRateRow) });
}

/** PATCH /api/commissions/rates/:userId — own cut for a month. */
export async function updateUserRate(req, res) {
  const { userId } = req.params;
  const { commissionPercentage, month } = req.body;
  const monthKey = month || currentMonthKey();

  if (commissionPercentage === undefined) {
    return res.status(400).json({ error: 'commissionPercentage is required' });
  }
  if (!isValidPercentage(commissionPercentage)) {
    return res
      .status(400)
      .json({ error: 'Commission must be between 0 and 100 with at most 2 decimals' });
  }
  if (!isValidMonth(monthKey)) {
    return res.status(400).json({ error: 'month must look like YYYY-MM' });
  }

  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const next = money(Number(commissionPercentage));
  if (!EARNING_ROLES.includes(user.role) && next > 0) {
    return res.status(400).json({
      error: `${user.role} users do not earn commission — only ${EARNING_ROLES.join(' and ')} can have a rate`,
    });
  }

  if (user.manager_id) {
    const mgrCut = await getManagerRate(user.manager_id, userId, monthKey);
    const errors = validateRates({ agentPercentage: next, managerPercentage: mgrCut });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  }

  await setUserRate({
    userId,
    month: monthKey,
    percentage: next,
    actorId: req.user.id,
  });

  res.json({ rate: await fetchRateRow(userId, monthKey) });
}

/**
 * PUT /api/commissions/overrides
 * Body: { managerId, agentId, commissionPercentage, month? }
 * What the manager earns on this specific agent for that month.
 */
export async function setManagerCut(req, res) {
  const { managerId, agentId, commissionPercentage, month } = req.body;
  const monthKey = month || currentMonthKey();

  if (managerId === undefined || agentId === undefined || commissionPercentage === undefined) {
    return res.status(400).json({ error: 'managerId, agentId and commissionPercentage are required' });
  }
  if (Number(managerId) === Number(agentId)) {
    return res.status(400).json({ error: 'A manager cannot take a cut on themselves' });
  }
  if (!isValidPercentage(commissionPercentage)) {
    return res
      .status(400)
      .json({ error: 'Commission must be between 0 and 100 with at most 2 decimals' });
  }
  if (!isValidMonth(monthKey)) {
    return res.status(400).json({ error: 'month must look like YYYY-MM' });
  }

  const [[manager]] = await pool.query('SELECT * FROM users WHERE id = ?', [managerId]);
  if (!manager) return res.status(404).json({ error: 'Manager not found' });
  if (manager.role !== 'manager') {
    return res.status(400).json({ error: `The selected user is not a manager (got ${manager.role})` });
  }

  const [[agent]] = await pool.query('SELECT * FROM users WHERE id = ?', [agentId]);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (Number(agent.manager_id) !== Number(managerId)) {
    return res
      .status(400)
      .json({ error: `${agent.name} does not report to ${manager.name} — assign them first` });
  }

  const agentOwn = await getUserRate(agentId, monthKey);
  const errors = validateRates({
    agentPercentage: agentOwn,
    managerPercentage: Number(commissionPercentage),
  });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  await setManagerRate({
    managerId,
    agentId,
    month: monthKey,
    percentage: Number(commissionPercentage),
    actorId: req.user.id,
  });

  res.json({ rate: await fetchRateRow(agentId, monthKey) });
}

/** DELETE /api/commissions/overrides/:managerId/:agentId */
export async function deleteManagerCut(req, res) {
  const { managerId, agentId } = req.params;
  const [result] = await pool.query(
    'SELECT COUNT(*) AS n FROM manager_agent_rates WHERE manager_id = ? AND agent_id = ?',
    [managerId, agentId]
  );
  if (Number(result[0].n) === 0) {
    return res.status(404).json({ error: 'No commission is configured for that pair' });
  }

  await clearManagerRates(managerId, agentId);
  res.json({ rate: await fetchRateRow(agentId, currentMonthKey()) });
}

/** GET /api/commissions/rates/:userId/history */
export async function rateHistory(req, res) {
  const [[user]] = await pool.query('SELECT id, name FROM users WHERE id = ?', [req.params.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const history = await getRateHistory(user.id);
  res.json({ userId: user.id, name: user.name, ...history });
}

/** GET /api/commissions/team?month=YYYY-MM */
export async function getTeam(req, res) {
  const managerId =
    req.user.role === 'admin' && req.query.managerId ? req.query.managerId : req.user.id;
  const monthKey = req.query.month || currentMonthKey();
  if (!isValidMonth(monthKey)) {
    return res.status(400).json({ error: 'month must look like YYYY-MM' });
  }
  const monthStart = toMonthStart(monthKey);

  const [[manager]] = await pool.query('SELECT * FROM users WHERE id = ?', [managerId]);
  if (!manager) return res.status(404).json({ error: 'Manager not found' });

  const managerOwn = await getUserRate(manager.id, monthKey);

  const [rows] = await pool.query(
    `SELECT u.*, m.name AS manager_name,
            ${USER_RATE_SUBQUERY} AS commission_percentage,
            ${MANAGER_RATE_SUBQUERY} AS manager_cut,
            ? AS month_key
     FROM users u
     LEFT JOIN users m ON m.id = u.manager_id
     WHERE u.manager_id = ? AND u.role = 'agent' AND u.is_active = 1
     ORDER BY u.name`,
    [monthStart, monthStart, monthKey, managerId]
  );

  res.json({
    month: monthKey,
    manager: {
      id: manager.id,
      name: manager.name,
      role: manager.role,
      ownCommissionPercentage: managerOwn,
    },
    team: rows.map(toRateRow),
  });
}
