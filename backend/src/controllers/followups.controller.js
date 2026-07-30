import { pool } from '../config/db.js';

const PRIORITIES = ['low', 'medium', 'high'];

function toFollowUp(row) {
  return {
    id: row.id,
    clientName: row.client_name,
    note: row.note,
    priority: row.priority,
    status: row.status,
    doneAt: row.done_at,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/follow-ups?status=
 * Only ever the caller's own rows. Pending first, then by priority, newest first.
 */
export async function listFollowUps(req, res) {
  const { status } = req.query;
  const where = ['user_id = ?'];
  const params = [req.user.id];

  if (status) {
    if (!['pending', 'done'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending or done' });
    }
    where.push('status = ?');
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT * FROM follow_ups
     WHERE ${where.join(' AND ')}
     ORDER BY status ASC,
              FIELD(priority, 'high', 'medium', 'low'),
              created_at DESC`,
    params
  );

  res.json({ followUps: rows.map(toFollowUp) });
}

/** POST /api/follow-ups — always created for the caller. */
export async function createFollowUp(req, res) {
  const clientName = String(req.body?.clientName ?? '').trim();
  const note = req.body?.note != null ? String(req.body.note).trim() : null;
  const priority = req.body?.priority ?? 'medium';

  const errors = [];
  if (!clientName) errors.push('Client name is required');
  else if (clientName.length > 160) errors.push('Client name must be 160 characters or fewer');
  if (note && note.length > 500) errors.push('Note must be 500 characters or fewer');
  if (!PRIORITIES.includes(priority)) errors.push(`Priority must be one of: ${PRIORITIES.join(', ')}`);
  if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });

  const [result] = await pool.query(
    'INSERT INTO follow_ups (user_id, client_name, note, priority) VALUES (?, ?, ?, ?)',
    [req.user.id, clientName, note || null, priority]
  );
  const [[row]] = await pool.query('SELECT * FROM follow_ups WHERE id = ?', [result.insertId]);
  res.status(201).json({ followUp: toFollowUp(row) });
}

/** Fetches a row and confirms the caller owns it. */
async function ownedRow(req, res) {
  const [[row]] = await pool.query('SELECT * FROM follow_ups WHERE id = ?', [req.params.id]);
  if (!row) {
    res.status(404).json({ error: 'Follow-up not found' });
    return null;
  }
  if (row.user_id !== req.user.id) {
    res.status(403).json({ error: 'This follow-up belongs to someone else' });
    return null;
  }
  return row;
}

/** PATCH /api/follow-ups/:id — edit fields and/or flip status. */
export async function updateFollowUp(req, res) {
  const existing = await ownedRow(req, res);
  if (!existing) return;

  const { clientName, note, priority, status } = req.body;

  let nextName = existing.client_name;
  if (clientName !== undefined) {
    nextName = String(clientName).trim();
    if (!nextName) return res.status(400).json({ error: 'Client name is required' });
    if (nextName.length > 160) return res.status(400).json({ error: 'Client name must be 160 characters or fewer' });
  }

  let nextNote = existing.note;
  if (note !== undefined) {
    nextNote = note ? String(note).trim() : null;
    if (nextNote && nextNote.length > 500) return res.status(400).json({ error: 'Note must be 500 characters or fewer' });
  }

  let nextPriority = existing.priority;
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: `Priority must be one of: ${PRIORITIES.join(', ')}` });
    nextPriority = priority;
  }

  let nextStatus = existing.status;
  let doneClause = 'done_at = done_at';
  if (status !== undefined) {
    if (!['pending', 'done'].includes(status)) return res.status(400).json({ error: 'status must be pending or done' });
    nextStatus = status;
    // Stamp done_at when marking done; clear it when reopening.
    doneClause = status === 'done' ? 'done_at = NOW()' : 'done_at = NULL';
  }

  await pool.query(
    `UPDATE follow_ups SET client_name = ?, note = ?, priority = ?, status = ?, ${doneClause} WHERE id = ?`,
    [nextName, nextNote, nextPriority, nextStatus, existing.id]
  );

  const [[row]] = await pool.query('SELECT * FROM follow_ups WHERE id = ?', [existing.id]);
  res.json({ followUp: toFollowUp(row) });
}

/** DELETE /api/follow-ups/:id */
export async function deleteFollowUp(req, res) {
  const existing = await ownedRow(req, res);
  if (!existing) return;
  await pool.query('DELETE FROM follow_ups WHERE id = ?', [existing.id]);
  res.status(204).send();
}
