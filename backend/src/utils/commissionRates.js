import { pool } from '../config/db.js';
import { money } from './commission.js';

/**
 * Month-wise commission rates.
 *
 * Two tables:
 *   1. user_commission_rates  — what an agent/manager earns on their own work
 *   2. manager_agent_rates    — what a manager earns on one specific agent
 *
 * A rate row says "from this month onward, the rate is X". A month with no row
 * of its own inherits the most recent earlier row, so April keeps reporting at
 * April's rate even after May is raised.
 */

/** '2026-07' or a Date -> '2026-07-01'. Defaults to the current month. */
export function toMonthStart(input) {
  if (!input) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (input instanceof Date) {
    return `${input.getFullYear()}-${String(input.getMonth() + 1).padStart(2, '0')}-01`;
  }
  const text = String(input).trim();
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text.slice(0, 7)}-01`;
  return null;
}

export function isValidMonth(input) {
  return toMonthStart(input) !== null;
}

/** Current calendar month as YYYY-MM. */
export function currentMonthKey() {
  return toMonthStart(null).slice(0, 7);
}

/** The person's own rate in force for `month`, or 0. */
export async function getUserRate(userId, month) {
  const monthStart = toMonthStart(month);
  const [[row]] = await pool.query(
    `SELECT commission_percentage FROM user_commission_rates
     WHERE user_id = ? AND effective_month <= ?
     ORDER BY effective_month DESC LIMIT 1`,
    [userId, monthStart]
  );
  return row ? Number(row.commission_percentage) : 0;
}

/** The manager's cut on that agent for `month`, or 0. */
export async function getManagerRate(managerId, agentId, month) {
  if (!managerId) return 0;
  const monthStart = toMonthStart(month);
  const [[row]] = await pool.query(
    `SELECT commission_percentage FROM manager_agent_rates
     WHERE manager_id = ? AND agent_id = ? AND effective_month <= ?
     ORDER BY effective_month DESC LIMIT 1`,
    [managerId, agentId, monthStart]
  );
  return row ? Number(row.commission_percentage) : 0;
}

/** SQL fragment — own rate. `?` = month start. */
export const USER_RATE_SUBQUERY = `
  (SELECT r.commission_percentage FROM user_commission_rates r
   WHERE r.user_id = u.id AND r.effective_month <= ?
   ORDER BY r.effective_month DESC LIMIT 1)
`;

/**
 * SQL fragment — manager's cut on this user for a month.
 * Returns NULL when never set (UI shows "not set" vs an explicit 0%).
 * `?` = month start.
 */
export const MANAGER_RATE_SUBQUERY = `
  (SELECT mr.commission_percentage FROM manager_agent_rates mr
   WHERE mr.manager_id = u.manager_id AND mr.agent_id = u.id AND mr.effective_month <= ?
   ORDER BY mr.effective_month DESC LIMIT 1)
`;

/** Own rate for a month. Re-setting the same month overwrites; earlier months stay. */
export async function setUserRate({ userId, month, percentage, actorId }) {
  const monthStart = toMonthStart(month);
  await pool.query(
    `INSERT INTO user_commission_rates (user_id, effective_month, commission_percentage, created_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       commission_percentage = VALUES(commission_percentage),
       created_by = VALUES(created_by)`,
    [userId, monthStart, money(Number(percentage)), actorId ?? null]
  );
}

/** Manager's cut on one agent for a month. */
export async function setManagerRate({ managerId, agentId, month, percentage, actorId }) {
  const monthStart = toMonthStart(month);
  await pool.query(
    `INSERT INTO manager_agent_rates (manager_id, agent_id, effective_month, commission_percentage, created_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       commission_percentage = VALUES(commission_percentage),
       created_by = VALUES(created_by)`,
    [managerId, agentId, monthStart, money(Number(percentage)), actorId ?? null]
  );
}

/** Remove every month's cut for a manager↔agent pair. */
export async function clearManagerRates(managerId, agentId) {
  await pool.query(
    'DELETE FROM manager_agent_rates WHERE manager_id = ? AND agent_id = ?',
    [managerId, agentId]
  );
}

/** Change log: own rates + each manager cut recorded against this person. */
export async function getRateHistory(userId) {
  const [ownRows] = await pool.query(
    `SELECT r.effective_month, r.commission_percentage, r.updated_at, c.name AS set_by
     FROM user_commission_rates r
     LEFT JOIN users c ON c.id = r.created_by
     WHERE r.user_id = ?
     ORDER BY r.effective_month DESC`,
    [userId]
  );

  const [managerRows] = await pool.query(
    `SELECT r.effective_month, r.commission_percentage, r.updated_at,
            m.name AS manager_name, c.name AS set_by
     FROM manager_agent_rates r
     JOIN users m ON m.id = r.manager_id
     LEFT JOIN users c ON c.id = r.created_by
     WHERE r.agent_id = ?
     ORDER BY r.effective_month DESC`,
    [userId]
  );

  const shape = (row) => ({
    month: String(row.effective_month).slice(0, 7),
    percentage: Number(row.commission_percentage),
    setBy: row.set_by,
    updatedAt: row.updated_at,
  });

  return {
    own: ownRows.map(shape),
    managerCut: managerRows.map((row) => ({ ...shape(row), managerName: row.manager_name })),
  };
}
