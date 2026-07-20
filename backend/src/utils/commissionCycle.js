import { pool } from '../config/db.js';
import { karachiWorkDate } from './karachiTime.js';
import { money } from './commission.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toIsoDate(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

function normalizeWorkDate(inputDate = new Date()) {
  if (typeof inputDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
    return inputDate;
  }
  return karachiWorkDate(inputDate instanceof Date ? inputDate : new Date());
}

/** Clamp day into month length (end_day up to 28 by constraint; still safe). */
function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function clampDay(year, month1to12, day) {
  return Math.min(day, daysInMonth(year, month1to12));
}

function shiftMonth(year, month1to12, delta) {
  let y = year;
  let m = month1to12 + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { y, m };
}

/**
 * Pure formula: anchor_day of month M → end_day of month M+1.
 * If day < anchor, cycle started previous month.
 */
export function computeCycleBoundsFromPolicy(workDate, { anchorDay = 15, endDay = 14 } = {}) {
  const [y, m, d] = workDate.split('-').map(Number);
  let startY = y;
  let startM = m;
  if (d < anchorDay) {
    const prev = shiftMonth(y, m, -1);
    startY = prev.y;
    startM = prev.m;
  }

  const end = shiftMonth(startY, startM, 1);
  const startDay = clampDay(startY, startM, anchorDay);
  const endDayClamped = clampDay(end.y, end.m, endDay);

  const cycleStart = `${startY}-${pad(startM)}-${pad(startDay)}`;
  const cycleEnd = `${end.y}-${pad(end.m)}-${pad(endDayClamped)}`;
  return {
    cycleStart,
    cycleEnd,
    label: `${cycleStart} → ${cycleEnd}`,
    source: 'policy',
    anchorDay,
    endDay,
  };
}

export async function getActivePolicy(workDate) {
  const date = normalizeWorkDate(workDate);
  const [[row]] = await pool.query(
    `SELECT * FROM cycle_policies
     WHERE effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC, id DESC
     LIMIT 1`,
    [date, date]
  );
  return row || null;
}

export async function findOverrideForDate(workDate) {
  const date = normalizeWorkDate(workDate);
  const [[row]] = await pool.query(
    `SELECT * FROM cycle_overrides
     WHERE ? BETWEEN cycle_start AND cycle_end
     ORDER BY cycle_start DESC, id DESC
     LIMIT 1`,
    [date]
  );
  return row || null;
}

/**
 * Resolve cycle window for a payment/work date.
 * Override wins over versioned policy. Does not mutate ledger history.
 */
export async function getCycleBounds(inputDate = new Date()) {
  const workDate = normalizeWorkDate(inputDate);

  const override = await findOverrideForDate(workDate);
  if (override) {
    const cycleStart = toIsoDate(override.cycle_start);
    const cycleEnd = toIsoDate(override.cycle_end);
    return {
      cycleStart,
      cycleEnd,
      label: `${cycleStart} → ${cycleEnd}`,
      source: 'override',
      overrideId: override.id,
      reason: override.reason,
    };
  }

  const policy = await getActivePolicy(workDate);
  const anchorDay = Number(policy?.anchor_day ?? 15);
  const endDay = Number(policy?.end_day ?? 14);
  const bounds = computeCycleBoundsFromPolicy(workDate, { anchorDay, endDay });
  return {
    ...bounds,
    policyId: policy?.id ?? null,
  };
}

/** YYYY-MM used to look up month-wise rates for a payment date. */
export function rateMonthForPaymentDate(paymentDate) {
  return String(paymentDate).slice(0, 7);
}

export function calcCommissionAmount(paymentAmount, ratePercentage) {
  return money((Number(paymentAmount) * Number(ratePercentage)) / 100);
}

export function mapPolicy(row) {
  if (!row) return null;
  return {
    id: row.id,
    anchorDay: Number(row.anchor_day),
    endDay: Number(row.end_day),
    effectiveFrom: toIsoDate(row.effective_from),
    effectiveTo: toIsoDate(row.effective_to),
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function mapOverride(row) {
  if (!row) return null;
  return {
    id: row.id,
    cycleStart: toIsoDate(row.cycle_start),
    cycleEnd: toIsoDate(row.cycle_end),
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
