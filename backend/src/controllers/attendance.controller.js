import { pool } from '../config/db.js';
import { computeAttendanceStatus, isLateCheckIn } from '../utils/attendanceRules.js';
import {
  karachiWorkDate,
  toMysqlUtc,
  formatKarachiTime,
  workedMinutesBetween,
  parseMysqlUtc,
  monthBounds,
  karachiWallToUtcDate,
  averageKarachiClock,
  DEFAULT_CHECKOUT_HOUR,
  DEFAULT_CHECKOUT_MINUTE,
} from '../utils/karachiTime.js';
import { notifyLateCheckIn } from '../services/notifications.js';

const CHECKIN_ROLES = ['agent', 'manager'];

function assertCanCheckIn(user) {
  if (!CHECKIN_ROLES.includes(user.role)) {
    const err = new Error('Only agents and managers can check in');
    err.status = 403;
    throw err;
  }
}

function toSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    workDate: row.work_date,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    checkInDisplay: formatKarachiTime(row.check_in_time),
    checkOutDisplay: formatKarachiTime(row.check_out_time),
    emailsSent: row.emails_sent ?? null,
    workedMinutes: row.worked_minutes ?? null,
  };
}

function toDayRecord(row, activeSession = null) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    workDate: row.work_date,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    checkInDisplay: formatKarachiTime(row.check_in_time),
    checkOutDisplay: formatKarachiTime(row.check_out_time),
    status: row.status,
    emailsSent: row.emails_sent ?? null,
    workedMinutes: row.worked_minutes ?? null,
    activeSessionId: activeSession?.id ?? null,
  };
}

async function monthSummary(userId, monthStr) {
  const { start, end } = monthBounds(monthStr);
  const [[counts]] = await pool.query(
    `SELECT
       SUM(status = 'late') AS late_count,
       SUM(status = 'off') AS offs_taken,
       SUM(status IN ('present', 'late')) AS present_count
     FROM attendance_records
     WHERE user_id = ? AND work_date BETWEEN ? AND ?`,
    [userId, start, end]
  );
  const lateCount = Number(counts?.late_count || 0);
  const offsTaken = Number(counts?.offs_taken || 0);
  const presentCount = Number(counts?.present_count || 0);
  return {
    presentCount,
    ...computeAttendanceStatus({ lateCount, offsTaken }),
  };
}

async function findOpenSessionsBefore(userId, today) {
  const [rows] = await pool.query(
    `SELECT * FROM attendance_sessions
     WHERE user_id = ? AND check_out_time IS NULL AND work_date < ?
     ORDER BY work_date DESC, id DESC`,
    [userId, today]
  );
  return rows;
}

async function findActiveSession(userId, workDate) {
  const [[row]] = await pool.query(
    `SELECT * FROM attendance_sessions
     WHERE user_id = ? AND work_date = ? AND check_out_time IS NULL
     ORDER BY id DESC LIMIT 1`,
    [userId, workDate]
  );
  return row || null;
}

async function listTodaySessions(userId, workDate) {
  const [rows] = await pool.query(
    `SELECT * FROM attendance_sessions
     WHERE user_id = ? AND work_date = ?
     ORDER BY id ASC`,
    [userId, workDate]
  );
  return rows;
}

async function refreshDayAggregate(userId, workDate) {
  const [[agg]] = await pool.query(
    `SELECT
       MIN(check_in_time) AS first_in,
       MAX(check_out_time) AS last_out,
       SUM(COALESCE(worked_minutes, 0)) AS total_minutes,
       SUM(COALESCE(emails_sent, 0)) AS total_emails,
       SUM(check_out_time IS NULL) AS open_count
     FROM attendance_sessions
     WHERE user_id = ? AND work_date = ?`,
    [userId, workDate]
  );

  if (!agg?.first_in) return null;

  const openCount = Number(agg.open_count || 0);
  const checkOut = openCount > 0 ? null : agg.last_out;
  const emails = Number(agg.total_emails || 0);
  const minutes = Number(agg.total_minutes || 0);

  await pool.query(
    `UPDATE attendance_records
     SET check_in_time = ?, check_out_time = ?, emails_sent = ?, worked_minutes = ?
     WHERE user_id = ? AND work_date = ?`,
    [agg.first_in, checkOut, emails, minutes, userId, workDate]
  );

  await pool.query(
    `INSERT INTO daily_progress (user_id, work_date, emails_sent)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE emails_sent = VALUES(emails_sent)`,
    [userId, workDate, emails]
  );

  const [[day]] = await pool.query(
    'SELECT * FROM attendance_records WHERE user_id = ? AND work_date = ?',
    [userId, workDate]
  );
  return day;
}

async function closeSession(session, emailsSent, checkOutDate) {
  const checkOutUtc = toMysqlUtc(checkOutDate);
  const minutes = workedMinutesBetween(session.check_in_time, checkOutUtc);
  await pool.query(
    `UPDATE attendance_sessions
     SET check_out_time = ?, emails_sent = ?, worked_minutes = ?
     WHERE id = ?`,
    [checkOutUtc, emailsSent, minutes, session.id]
  );
  return refreshDayAggregate(session.user_id, session.work_date);
}

/**
 * Auto-close older forgotten days at 6:00 PM PKT with emails_sent=0.
 * Keeps only the most recent open past session for the user to confirm.
 */
async function resolveOpenPastSessions(userId, today) {
  const opens = await findOpenSessionsBefore(userId, today);
  if (!opens.length) return null;
  const [latest, ...stale] = opens;
  for (const row of stale) {
    const checkOutDate = karachiWallToUtcDate(
      row.work_date,
      DEFAULT_CHECKOUT_HOUR,
      DEFAULT_CHECKOUT_MINUTE
    );
    const checkIn = parseMysqlUtc(row.check_in_time);
    const safeOut =
      checkIn && checkOutDate.getTime() < checkIn.getTime()
        ? new Date(checkIn.getTime() + 60 * 1000)
        : checkOutDate;
    await closeSession(row, 0, safeOut);
  }
  return latest;
}

async function buildTodayPayload(userId) {
  const today = karachiWorkDate();
  const monthStr = today.slice(0, 7);
  const [[day]] = await pool.query(
    'SELECT * FROM attendance_records WHERE user_id = ? AND work_date = ?',
    [userId, today]
  );
  const active = await findActiveSession(userId, today);
  const sessions = await listTodaySessions(userId, today);
  const openPast = await resolveOpenPastSessions(userId, today);
  const summary = await monthSummary(userId, monthStr);

  let elapsedSeconds = null;
  if (active?.check_in_time) {
    const start = parseMysqlUtc(active.check_in_time);
    elapsedSeconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  }

  return {
    today,
    serverNow: new Date().toISOString(),
    record: toDayRecord(day, active),
    activeSession: toSession(active),
    sessions: sessions.map(toSession),
    canCheckIn: !active && !openPast,
    openSession: openPast
      ? {
          ...toSession(openPast),
          suggestedCheckoutDisplay: formatKarachiTime(
            karachiWallToUtcDate(openPast.work_date, DEFAULT_CHECKOUT_HOUR, DEFAULT_CHECKOUT_MINUTE)
          ),
        }
      : null,
    elapsedSeconds,
    month: summary,
  };
}

/** GET /api/attendance/today */
export async function getToday(req, res) {
  assertCanCheckIn(req.user);
  res.json(await buildTodayPayload(req.user.id));
}

/**
 * POST /api/attendance/check-in
 * Starts a new session. Allowed multiple times per day after checkout.
 */
export async function checkIn(req, res) {
  assertCanCheckIn(req.user);
  const today = karachiWorkDate();
  const now = new Date();

  const openPast = await resolveOpenPastSessions(req.user.id, today);
  if (openPast) {
    return res.status(409).json({
      error: 'You have an open session from a previous day. Close it before checking in.',
      openSession: toSession(openPast),
    });
  }

  const active = await findActiveSession(req.user.id, today);
  if (active) {
    return res.status(409).json({
      error: 'Already checked in — check out first',
      activeSession: toSession(active),
    });
  }

  const checkInUtc = toMysqlUtc(now);
  const [[existingDay]] = await pool.query(
    'SELECT * FROM attendance_records WHERE user_id = ? AND work_date = ?',
    [req.user.id, today]
  );

  const isFirstSession = !existingDay?.check_in_time;
  const late = isFirstSession ? isLateCheckIn(now) : existingDay.status === 'late';
  const status = isFirstSession ? (late ? 'late' : 'present') : existingDay.status;

  if (existingDay) {
    // Re-check-in after checkout: keep original day status (late/present from first punch).
    await pool.query(
      `UPDATE attendance_records
       SET check_out_time = NULL
       WHERE id = ?`,
      [existingDay.id]
    );
    if (isFirstSession) {
      await pool.query(
        `UPDATE attendance_records SET check_in_time = ?, status = ? WHERE id = ?`,
        [checkInUtc, status, existingDay.id]
      );
    }
  } else {
    await pool.query(
      `INSERT INTO attendance_records (user_id, work_date, check_in_time, status)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, today, checkInUtc, status]
    );
  }

  await pool.query(
    `INSERT INTO attendance_sessions (user_id, work_date, check_in_time)
     VALUES (?, ?, ?)`,
    [req.user.id, today, checkInUtc]
  );

  await refreshDayAggregate(req.user.id, today);
  const payload = await buildTodayPayload(req.user.id);

  // Fire-and-forget WhatsApp + in-app late alert (Wasender).
  if (isFirstSession && late) {
    const checkInDisplay = formatKarachiTime(checkInUtc) || 'after cutoff';
    notifyLateCheckIn({
      userId: req.user.id,
      userName: req.user.name,
      checkInDisplay,
    }).catch((err) => console.error('[late-alert]', err.message));
  }

  res.status(201).json({
    ...payload,
    late: isFirstSession ? late : false,
    reentry: !isFirstSession,
  });
}

/**
 * POST /api/attendance/check-out
 * Body: { emailsSent, workDate?, useDefaultTime?, sessionId? }
 */
export async function checkOut(req, res) {
  assertCanCheckIn(req.user);

  const emailsRaw = req.body?.emailsSent;
  const emailsSent = Number(emailsRaw);
  if (!Number.isFinite(emailsSent) || emailsSent < 0 || !Number.isInteger(emailsSent)) {
    return res.status(400).json({ error: 'emailsSent must be a non-negative integer' });
  }

  const today = karachiWorkDate();
  const workDate = req.body?.workDate ? String(req.body.workDate) : today;
  const useDefaultTime = Boolean(req.body?.useDefaultTime);
  const sessionId = req.body?.sessionId ? Number(req.body.sessionId) : null;

  let session;
  if (sessionId) {
    const [[row]] = await pool.query(
      'SELECT * FROM attendance_sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );
    session = row;
  } else {
    session = await findActiveSession(req.user.id, workDate);
  }

  if (!session) {
    return res.status(400).json({ error: 'No open session to check out' });
  }
  if (session.check_out_time) {
    return res.status(409).json({ error: 'Session already checked out', session: toSession(session) });
  }

  let checkOutDate = new Date();
  if (useDefaultTime || workDate < today) {
    checkOutDate = karachiWallToUtcDate(workDate, DEFAULT_CHECKOUT_HOUR, DEFAULT_CHECKOUT_MINUTE);
    const checkIn = parseMysqlUtc(session.check_in_time);
    if (checkIn && checkOutDate.getTime() < checkIn.getTime()) {
      checkOutDate = new Date(checkIn.getTime() + 60 * 1000);
    }
  }

  await closeSession(session, emailsSent, checkOutDate);
  const payload = await buildTodayPayload(req.user.id);
  res.json(payload);
}

/**
 * PATCH /api/attendance/progress
 * Body: { emailsSent } — update today's cumulative emails (can fix mistakes anytime).
 */
export async function updateProgress(req, res) {
  assertCanCheckIn(req.user);

  const emailsSent = Number(req.body?.emailsSent);
  if (!Number.isFinite(emailsSent) || emailsSent < 0 || !Number.isInteger(emailsSent)) {
    return res.status(400).json({ error: 'emailsSent must be a non-negative integer' });
  }

  const today = karachiWorkDate();
  const [[day]] = await pool.query(
    'SELECT * FROM attendance_records WHERE user_id = ? AND work_date = ?',
    [req.user.id, today]
  );
  if (!day?.check_in_time) {
    return res.status(400).json({ error: 'Check in before updating progress' });
  }

  const active = await findActiveSession(req.user.id, today);
  if (active) {
    // Put the delta on the active session so aggregates stay consistent.
    const [[agg]] = await pool.query(
      `SELECT COALESCE(SUM(emails_sent), 0) AS other_emails
       FROM attendance_sessions
       WHERE user_id = ? AND work_date = ? AND id <> ?`,
      [req.user.id, today, active.id]
    );
    const other = Number(agg?.other_emails || 0);
    const sessionEmails = Math.max(0, emailsSent - other);
    await pool.query('UPDATE attendance_sessions SET emails_sent = ? WHERE id = ?', [
      sessionEmails,
      active.id,
    ]);
  } else {
    // No open session: set on the latest closed session.
    const [[latest]] = await pool.query(
      `SELECT id FROM attendance_sessions
       WHERE user_id = ? AND work_date = ?
       ORDER BY id DESC LIMIT 1`,
      [req.user.id, today]
    );
    if (latest) {
      const [[agg]] = await pool.query(
        `SELECT COALESCE(SUM(emails_sent), 0) AS other_emails
         FROM attendance_sessions
         WHERE user_id = ? AND work_date = ? AND id <> ?`,
        [req.user.id, today, latest.id]
      );
      const other = Number(agg?.other_emails || 0);
      await pool.query('UPDATE attendance_sessions SET emails_sent = ? WHERE id = ?', [
        Math.max(0, emailsSent - other),
        latest.id,
      ]);
    }
  }

  await pool.query(
    `UPDATE attendance_records SET emails_sent = ? WHERE user_id = ? AND work_date = ?`,
    [emailsSent, req.user.id, today]
  );
  await pool.query(
    `INSERT INTO daily_progress (user_id, work_date, emails_sent)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE emails_sent = VALUES(emails_sent)`,
    [req.user.id, today, emailsSent]
  );

  res.json(await buildTodayPayload(req.user.id));
}

/** GET /api/attendance/me?month=YYYY-MM */
export async function getMyMonth(req, res) {
  assertCanCheckIn(req.user);
  const today = karachiWorkDate();
  const monthStr = req.query.month || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    return res.status(400).json({ error: 'month must be YYYY-MM' });
  }

  const { start, end, year, month, lastDay } = monthBounds(monthStr);
  const [rows] = await pool.query(
    `SELECT * FROM attendance_records
     WHERE user_id = ? AND work_date BETWEEN ? AND ?
     ORDER BY work_date`,
    [req.user.id, start, end]
  );

  const byDate = new Map(rows.map((r) => [r.work_date, r]));
  const todayDay = today.startsWith(monthStr) ? Number(today.slice(8, 10)) : null;
  const isCurrentMonth = today.startsWith(monthStr);
  const isPastMonth = monthStr < today.slice(0, 7);

  const days = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rec = byDate.get(date);
    let status;
    if (rec) {
      status = rec.status;
    } else if (isPastMonth || (isCurrentMonth && todayDay != null && d < todayDay)) {
      status = 'absent';
    } else if (isCurrentMonth && todayDay != null && d === todayDay) {
      status = 'absent';
    } else {
      status = 'future';
    }
    days.push({
      day: d,
      date,
      status,
      checkInDisplay: rec ? formatKarachiTime(rec.check_in_time) : null,
      checkOutDisplay: rec ? formatKarachiTime(rec.check_out_time) : null,
      emailsSent: rec?.emails_sent ?? null,
    });
  }

  const summary = await monthSummary(req.user.id, monthStr);
  res.json({ month: monthStr, days, summary });
}

/** GET /api/attendance/team?date=YYYY-MM-DD | from=&to= | month=YYYY-MM
 * date (default today): day roster with check-in/out for that date
 * from+to: range summary per person
 * month: used for late/off averages (defaults to month of date/from)
 */
export async function getTeam(req, res) {
  const role = req.user.role;
  if (!['admin', 'manager'].includes(role)) {
    return res.status(403).json({ error: 'Insufficient role' });
  }

  const today = karachiWorkDate();
  const fromQ = req.query.from;
  const toQ = req.query.to;
  const dateQ = req.query.date;
  const isRange = Boolean(fromQ && toQ);

  if (isRange) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromQ) || !/^\d{4}-\d{2}-\d{2}$/.test(toQ)) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
    }
    if (fromQ > toQ) {
      return res.status(400).json({ error: 'from must be on or before to' });
    }
  }

  const viewDate = isRange ? null : (dateQ || today);
  if (viewDate && !/^\d{4}-\d{2}-\d{2}$/.test(viewDate)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  const monthStr =
    req.query.month ||
    (isRange ? fromQ.slice(0, 7) : viewDate.slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    return res.status(400).json({ error: 'month must be YYYY-MM' });
  }
  const { start, end } = monthBounds(monthStr);

  const users = await listTeamUsers(req.user);
  if (!users.length) {
    return res.json({
      mode: isRange ? 'range' : 'day',
      date: viewDate,
      from: isRange ? fromQ : null,
      to: isRange ? toQ : null,
      month: monthStr,
      today,
      members: [],
    });
  }

  const ids = users.map((u) => u.id);
  const placeholders = ids.map(() => '?').join(',');

  const [monthRows] = await pool.query(
    `SELECT user_id,
       SUM(status = 'late') AS late_count,
       SUM(status = 'off') AS offs_taken,
       SUM(status IN ('present', 'late')) AS present_count
     FROM attendance_records
     WHERE work_date BETWEEN ? AND ? AND user_id IN (${placeholders})
     GROUP BY user_id`,
    [start, end, ...ids]
  );
  const monthByUser = new Map(monthRows.map((r) => [r.user_id, r]));

  const [avgSourceRows] = await pool.query(
    `SELECT user_id, check_in_time, check_out_time
     FROM attendance_records
     WHERE work_date BETWEEN ? AND ?
       AND user_id IN (${placeholders})
       AND status IN ('present', 'late')
       AND check_in_time IS NOT NULL`,
    [start, end, ...ids]
  );
  const inByUser = new Map();
  const outByUser = new Map();
  for (const row of avgSourceRows) {
    if (!inByUser.has(row.user_id)) inByUser.set(row.user_id, []);
    inByUser.get(row.user_id).push(row.check_in_time);
    if (row.check_out_time) {
      if (!outByUser.has(row.user_id)) outByUser.set(row.user_id, []);
      outByUser.get(row.user_id).push(row.check_out_time);
    }
  }

  let dayByUser = new Map();
  let openSet = new Set();
  let rangeByUser = new Map();

  if (isRange) {
    const [rangeRows] = await pool.query(
      `SELECT user_id,
         SUM(status IN ('present', 'late')) AS present_days,
         SUM(status = 'late') AS late_days,
         SUM(status = 'off') AS leave_days,
         SUM(status = 'absent') AS absent_days
       FROM attendance_records
       WHERE work_date BETWEEN ? AND ? AND user_id IN (${placeholders})
       GROUP BY user_id`,
      [fromQ, toQ, ...ids]
    );
    rangeByUser = new Map(rangeRows.map((r) => [r.user_id, r]));
  } else {
    const [dayRows] = await pool.query(
      `SELECT * FROM attendance_records
       WHERE work_date = ? AND user_id IN (${placeholders})`,
      [viewDate, ...ids]
    );
    dayByUser = new Map(dayRows.map((r) => [r.user_id, r]));

    const [openSessions] = await pool.query(
      `SELECT user_id FROM attendance_sessions
       WHERE work_date = ? AND check_out_time IS NULL AND user_id IN (${placeholders})`,
      [viewDate, ...ids]
    );
    openSet = new Set(openSessions.map((r) => r.user_id));
  }

  const members = users.map((u) => {
    const m = monthByUser.get(u.id);
    const lateCount = Number(m?.late_count || 0);
    const offsTaken = Number(m?.offs_taken || 0);
    const rules = computeAttendanceStatus({ lateCount, offsTaken });
    const avgCheckIn = averageKarachiClock(inByUser.get(u.id) || []);
    const avgCheckOut = averageKarachiClock(outByUser.get(u.id) || []);

    const base = {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avgCheckIn,
      avgCheckOut,
      presentCount: Number(m?.present_count || 0),
      lateCount,
      offsTaken,
      ...rules,
    };

    if (isRange) {
      const r = rangeByUser.get(u.id);
      return {
        ...base,
        statusDay: null,
        statusLabel: null,
        checkIn: null,
        checkOut: null,
        range: {
          present: Number(r?.present_days || 0),
          late: Number(r?.late_days || 0),
          leave: Number(r?.leave_days || 0),
          absent: Number(r?.absent_days || 0),
        },
      };
    }

    const t = dayByUser.get(u.id);
    let statusDay = 'absent';
    if (t) {
      if (t.status === 'off') statusDay = 'leave';
      else if (openSet.has(u.id)) statusDay = t.status === 'late' ? 'late' : 'present';
      else if (t.check_in_time) statusDay = t.status === 'late' ? 'late' : 'present';
      else if (t.status === 'absent') statusDay = 'absent';
      else statusDay = t.status === 'off' ? 'leave' : t.status;
    }

    return {
      ...base,
      statusDay,
      statusLabel: statusDay,
      statusToday: statusDay, // back-compat
      checkIn: t?.check_in_time ? formatKarachiTime(t.check_in_time) : null,
      checkOut:
        t?.check_out_time && !openSet.has(u.id) ? formatKarachiTime(t.check_out_time) : null,
      range: null,
    };
  });

  const teamAvgCheckIn = averageKarachiClock(
    avgSourceRows.map((r) => r.check_in_time).filter(Boolean)
  );
  const teamAvgCheckOut = averageKarachiClock(
    avgSourceRows.map((r) => r.check_out_time).filter(Boolean)
  );

  const present = members.filter((a) => a.statusDay === 'present' || a.statusDay === 'late').length;
  const late = members.filter((a) => a.statusDay === 'late').length;
  const leave = members.filter((a) => a.statusDay === 'leave').length;
  const absent = members.filter((a) => a.statusDay === 'absent').length;

  res.json({
    mode: isRange ? 'range' : 'day',
    date: viewDate,
    from: isRange ? fromQ : null,
    to: isRange ? toQ : null,
    month: monthStr,
    today,
    teamAvgCheckIn,
    teamAvgCheckOut,
    stats: isRange
      ? null
      : { present, late, leave, absent },
    members,
  });
}

async function listTeamUsers(actor) {
  if (actor.role === 'admin') {
    const [rows] = await pool.query(
      `SELECT id, name, email, role FROM users
       WHERE is_active = 1 AND role IN ('agent', 'manager')
       ORDER BY role DESC, name`
    );
    return rows;
  }
  const [rows] = await pool.query(
    `SELECT id, name, email, role FROM users
     WHERE is_active = 1 AND (id = ? OR (role = 'agent' AND manager_id = ?))
     ORDER BY FIELD(role, 'manager', 'agent'), name`,
    [actor.id, actor.id]
  );
  return rows;
}

async function assertCanViewMember(actor, userId) {
  const team = await listTeamUsers(actor);
  if (!team.some((u) => Number(u.id) === Number(userId))) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

/**
 * GET /api/attendance/team/:userId?month=YYYY-MM | from=&to=
 * Day-by-day history for one team member.
 */
export async function getMemberAttendance(req, res) {
  const role = req.user.role;
  if (!['admin', 'manager'].includes(role)) {
    return res.status(403).json({ error: 'Insufficient role' });
  }

  const userId = Number(req.params.userId);
  await assertCanViewMember(req.user, userId);

  const [[person]] = await pool.query(
    `SELECT id, name, email, role FROM users WHERE id = ?`,
    [userId]
  );
  if (!person) return res.status(404).json({ error: 'User not found' });

  const today = karachiWorkDate();
  let start;
  let end;
  let monthStr = null;

  if (req.query.from && req.query.to) {
    start = req.query.from;
    end = req.query.to;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      return res.status(400).json({ error: 'Invalid from/to range' });
    }
  } else {
    monthStr = req.query.month || today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthStr)) {
      return res.status(400).json({ error: 'month must be YYYY-MM' });
    }
    ({ start, end } = monthBounds(monthStr));
  }

  const [rows] = await pool.query(
    `SELECT * FROM attendance_records
     WHERE user_id = ? AND work_date BETWEEN ? AND ?
     ORDER BY work_date DESC`,
    [userId, start, end]
  );

  const byDate = new Map(rows.map((r) => [String(r.work_date).slice(0, 10), r]));
  const days = [];
  const cursor = new Date(`${start}T12:00:00`);
  const endDt = new Date(`${end}T12:00:00`);
  while (cursor <= endDt) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const date = `${y}-${m}-${d}`;
    const rec = byDate.get(date);
    let status = 'absent';
    if (rec) {
      status = rec.status === 'off' ? 'leave' : rec.status;
    } else if (date > today) {
      status = 'future';
    }
    days.push({
      date,
      status,
      checkIn: rec?.check_in_time ? formatKarachiTime(rec.check_in_time) : null,
      checkOut: rec?.check_out_time ? formatKarachiTime(rec.check_out_time) : null,
      emailsSent: rec?.emails_sent ?? null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const summary = monthStr
    ? await monthSummary(userId, monthStr)
    : (() => {
        const lateCount = days.filter((d) => d.status === 'late').length;
        const offsTaken = days.filter((d) => d.status === 'leave').length;
        const presentCount = days.filter((d) => d.status === 'present' || d.status === 'late').length;
        return { presentCount, ...computeAttendanceStatus({ lateCount, offsTaken }) };
      })();

  res.json({
    person: {
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
    },
    month: monthStr,
    from: start,
    to: end,
    summary,
    days: days.reverse(), // newest first for list; calendar can re-sort
  });
}
