import { pool } from '../config/db.js';
import {
  getCycleBounds,
  getActivePolicy,
  mapPolicy,
  mapOverride,
  computeCycleBoundsFromPolicy,
} from '../utils/commissionCycle.js';
import { karachiWorkDate } from '../utils/karachiTime.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function dayOk(n) {
  const d = Number(n);
  return Number.isInteger(d) && d >= 1 && d <= 28;
}

/** GET /api/commissions/cycle-policy — current + history */
export async function listCyclePolicies(req, res) {
  const today = karachiWorkDate();
  const current = await getActivePolicy(today);
  const [rows] = await pool.query(
    `SELECT * FROM cycle_policies ORDER BY effective_from DESC, id DESC`
  );
  const bounds = await getCycleBounds(today);
  res.json({
    today,
    current: mapPolicy(current),
    currentCycle: bounds,
    policies: rows.map(mapPolicy),
  });
}

/**
 * POST /api/commissions/cycle-policy
 * Body: { anchorDay?, endDay, effectiveFrom?, notes? }
 * Closes the open policy and inserts a new one (future payments only).
 */
export async function createCyclePolicy(req, res) {
  const anchorDay = req.body.anchorDay !== undefined ? Number(req.body.anchorDay) : 15;
  const endDay = Number(req.body.endDay);
  if (!dayOk(anchorDay) || !dayOk(endDay)) {
    throw badRequest('anchorDay and endDay must be integers 1–28');
  }

  const today = karachiWorkDate();
  let effectiveFrom = req.body.effectiveFrom;
  if (effectiveFrom) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      throw badRequest('effectiveFrom must be YYYY-MM-DD');
    }
  } else {
    // Next cycle start under current open-cycle rules (never rewrite open cycle)
    const currentBounds = await getCycleBounds(today);
    const endDate = new Date(`${currentBounds.cycleEnd}T12:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    const nextDay = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    const openPolicy = await getActivePolicy(today);
    const bridge = computeCycleBoundsFromPolicy(nextDay, {
      anchorDay: Number(openPolicy?.anchor_day ?? 15),
      endDay: Number(openPolicy?.end_day ?? 14),
    });
    effectiveFrom = bridge.cycleStart;
  }

  if (effectiveFrom <= '2000-01-01') {
    throw badRequest('effectiveFrom is invalid');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[open]] = await conn.query(
      `SELECT * FROM cycle_policies
       WHERE effective_to IS NULL
       ORDER BY effective_from DESC, id DESC
       LIMIT 1
       FOR UPDATE`
    );

    if (open) {
      const openFrom = String(open.effective_from).slice(0, 10);
      if (effectiveFrom <= openFrom) {
        throw badRequest('effectiveFrom must be after the current policy start');
      }
      // Close previous day
      const closeDate = new Date(`${effectiveFrom}T12:00:00`);
      closeDate.setDate(closeDate.getDate() - 1);
      const effectiveTo = `${closeDate.getFullYear()}-${String(closeDate.getMonth() + 1).padStart(2, '0')}-${String(closeDate.getDate()).padStart(2, '0')}`;
      await conn.query(`UPDATE cycle_policies SET effective_to = ? WHERE id = ?`, [
        effectiveTo,
        open.id,
      ]);
    }

    const [result] = await conn.query(
      `INSERT INTO cycle_policies (anchor_day, end_day, effective_from, effective_to, created_by, notes)
       VALUES (?, ?, ?, NULL, ?, ?)`,
      [
        anchorDay,
        endDay,
        effectiveFrom,
        req.user.id,
        req.body.notes?.trim() || null,
      ]
    );

    await conn.commit();

    const [[row]] = await pool.query(`SELECT * FROM cycle_policies WHERE id = ?`, [result.insertId]);
    res.status(201).json({ policy: mapPolicy(row) });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** GET /api/commissions/cycle-overrides */
export async function listCycleOverrides(req, res) {
  const [rows] = await pool.query(
    `SELECT * FROM cycle_overrides ORDER BY cycle_start DESC, id DESC`
  );
  res.json({ overrides: rows.map(mapOverride) });
}

/**
 * POST /api/commissions/cycle-overrides
 * Body: { cycleStart, cycleEnd, reason? }
 */
export async function createCycleOverride(req, res) {
  const { cycleStart, cycleEnd, reason } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleStart || '') || !/^\d{4}-\d{2}-\d{2}$/.test(cycleEnd || '')) {
    throw badRequest('cycleStart and cycleEnd must be YYYY-MM-DD');
  }
  if (cycleEnd < cycleStart) {
    throw badRequest('cycleEnd must be on or after cycleStart');
  }

  const [[overlap]] = await pool.query(
    `SELECT id, cycle_start, cycle_end FROM cycle_overrides
     WHERE cycle_start <= ? AND cycle_end >= ?
     LIMIT 1`,
    [cycleEnd, cycleStart]
  );
  if (overlap) {
    throw badRequest(
      `Overlaps existing override ${String(overlap.cycle_start).slice(0, 10)} → ${String(overlap.cycle_end).slice(0, 10)}`
    );
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO cycle_overrides (cycle_start, cycle_end, reason, created_by)
       VALUES (?, ?, ?, ?)`,
      [cycleStart, cycleEnd, reason?.trim() || null, req.user.id]
    );
    const [[row]] = await pool.query(`SELECT * FROM cycle_overrides WHERE id = ?`, [result.insertId]);
    res.status(201).json({ override: mapOverride(row) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw badRequest('An override already exists for this cycle_start');
    }
    throw err;
  }
}

/** DELETE /api/commissions/cycle-overrides/:id */
export async function deleteCycleOverride(req, res) {
  const id = Number(req.params.id);
  const [result] = await pool.query(`DELETE FROM cycle_overrides WHERE id = ?`, [id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Override not found' });
  }
  res.status(204).end();
}
