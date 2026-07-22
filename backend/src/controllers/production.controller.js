import { pool } from '../config/db.js';
import { notifyProductionCardChange } from '../services/notifications.js';

const STAGES = new Set(['new_draft', 'in_progress', 'revision', 'review', 'live', 'done']);
const TYPES = new Set(['draft', 'revision']);
const PRIORITIES = new Set(['none', 'low', 'medium', 'high']);

const AVATARS = [
  '/assets/avatar-jane.svg',
  '/assets/avatar-robert.svg',
  '/assets/avatar-lina.svg',
  '/assets/avatar-maya.svg',
  '/assets/avatar-omar.svg',
];

function pickAvatar(id) {
  return AVATARS[Number(id) % AVATARS.length];
}

function normalizeUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

function isValidUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseExtras(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toCard(row) {
  const extras = parseExtras(row.extras_json);
  const assigneeId = row.assignee_id;
  return {
    id: row.id,
    title: row.title,
    client: row.client,
    clientId: row.client_id ?? null,
    clientAgentId: row.client_agent_id ?? null,
    clientAgentName: row.client_agent_name ?? null,
    type: row.type,
    stage: row.stage,
    assignee: {
      id: assigneeId,
      name: row.assignee_name || 'Unassigned',
      email: row.assignee_email || '',
      avatar: pickAvatar(assigneeId),
    },
    priority: row.priority_key || 'none',
    description: row.description || '',
    liveUrl: row.live_url || '',
    createdAt: row.created_at,
    dueDate: row.due_date,
    comments: Number(row.comments_count || 0),
    attachments: Number(row.attachments_count || 0),
    commentList: extras.commentList || [],
    fileList: extras.fileList || [],
    feedback: extras.feedback || {
      status: 'none',
      note: '',
      rating: null,
      updatedAt: null,
      author: null,
    },
  };
}

const CARD_SELECT = `
  SELECT pc.*,
    ua.name AS assignee_name,
    ua.email AS assignee_email,
    c.agent_id AS client_agent_id,
    ca.name AS client_agent_name
  FROM production_cards pc
  JOIN users ua ON ua.id = pc.assignee_id
  LEFT JOIN clients c ON c.id = pc.client_id
  LEFT JOIN users ca ON ca.id = c.agent_id
`;

async function resolveClient(clientId, clientName, { requireId = false } = {}) {
  if (clientId) {
    const [[row]] = await pool.query(
      'SELECT id, name, agent_id FROM clients WHERE id = ? AND is_active = 1',
      [Number(clientId)],
    );
    if (!row) {
      const err = new Error('Client not found or inactive');
      err.status = 400;
      throw err;
    }
    return { id: row.id, name: row.name, agentId: row.agent_id };
  }
  if (requireId) {
    const err = new Error('clientId is required — pick a CRM client');
    err.status = 400;
    throw err;
  }
  const name = String(clientName || '').trim();
  if (!name) return null;
  const [[match]] = await pool.query(
    'SELECT id, name, agent_id FROM clients WHERE LOWER(name) = LOWER(?) AND is_active = 1 LIMIT 1',
    [name],
  );
  return match ? { id: match.id, name: match.name, agentId: match.agent_id } : { id: null, name, agentId: null };
}

async function assertAssignee(assigneeId, { allowId } = {}) {
  const id = Number(assigneeId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('Assignee is required');
    err.status = 400;
    throw err;
  }
  const [[user]] = await pool.query(
    `SELECT id, role, is_active FROM users WHERE id = ?`,
    [id],
  );
  if (!user || !user.is_active) {
    const err = new Error('Assignee not found or inactive');
    err.status = 400;
    throw err;
  }
  const keptExisting = allowId != null && Number(allowId) === id;
  if (user.role !== 'production' && !keptExisting) {
    const err = new Error('Assignee must be a production user');
    err.status = 400;
    throw err;
  }
  return id;
}

const ALLOWED_FILE_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'zip', 'rar', 'mp4', 'mov', 'webm',
]);

function sanitizeExtras({ commentList, fileList, feedback }) {
  const comments = Array.isArray(commentList) ? commentList.slice(0, 200) : [];
  const filesIn = Array.isArray(fileList) ? fileList : [];
  if (filesIn.length > 10) {
    const err = new Error('A card can have at most 10 attachments');
    err.status = 400;
    throw err;
  }
  const files = [];
  let totalBytes = 0;
  for (const f of filesIn) {
    const name = String(f?.name || '').trim();
    const size = Number(f?.size || 0);
    const ext = name.toLowerCase().split('.').pop() || '';
    if (!name || !ALLOWED_FILE_EXT.has(ext)) {
      const err = new Error(`Attachment "${name || 'file'}" type is not allowed`);
      err.status = 400;
      throw err;
    }
    if (!(size > 0) || size > 5 * 1024 * 1024) {
      const err = new Error(`Attachment "${name}" must be between 1 byte and 5 MB`);
      err.status = 400;
      throw err;
    }
    totalBytes += size;
    if (totalBytes > 8 * 1024 * 1024) {
      const err = new Error('Attachments together cannot exceed 8 MB');
      err.status = 400;
      throw err;
    }
    const url = String(f?.url || '');
    if (url && !url.startsWith('data:') && !/^https?:\/\//i.test(url)) {
      const err = new Error(`Attachment "${name}" has an invalid URL`);
      err.status = 400;
      throw err;
    }
    files.push({
      id: f.id ?? Date.now(),
      name,
      size,
      type: String(f.type || 'application/octet-stream'),
      url: url || null,
      uploadedAt: f.uploadedAt || new Date().toISOString(),
    });
  }

  const fb = feedback && typeof feedback === 'object' ? feedback : {
    status: 'none', note: '', rating: null, updatedAt: null, author: null,
  };
  const allowedFb = new Set(['none', 'pending', 'approved', 'changes_requested']);
  if (!allowedFb.has(String(fb.status || 'none'))) {
    const err = new Error('Invalid feedback status');
    err.status = 400;
    throw err;
  }

  return { commentList: comments, fileList: files, feedback: fb };
}

async function syncClientProductionStatus(clientId) {
  if (!clientId) return;
  const [[stats]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN stage = 'done' THEN 1 ELSE 0 END) AS done_count
     FROM production_cards WHERE client_id = ?`,
    [clientId],
  );
  const total = Number(stats?.total || 0);
  const doneCount = Number(stats?.done_count || 0);
  let status = 'pending';
  if (total > 0) {
    status = doneCount === total ? 'done' : 'in_production';
  }
  await pool.query('UPDATE clients SET production_status = ? WHERE id = ?', [status, clientId]);
}

function priorityFlag(priority) {
  return priority === 'high' || priority === true ? 1 : 0;
}

export async function listCards(req, res) {
  const stage = req.query.stage ? String(req.query.stage) : '';
  const params = [];
  let where = 'WHERE 1=1';
  if (stage && STAGES.has(stage)) {
    where += ' AND pc.stage = ?';
    params.push(stage);
  }

  const [rows] = await pool.query(
    `${CARD_SELECT} ${where} ORDER BY pc.due_date ASC, pc.id DESC`,
    params,
  );
  res.json({ cards: rows.map(toCard) });
}

/**
 * Live portfolio for agents (own clients), managers (own + team), admins (all).
 */
export async function listPortfolio(req, res) {
  const role = req.user.role;
  const params = [];
  let where = `WHERE pc.stage = 'live' AND pc.live_url IS NOT NULL AND TRIM(pc.live_url) <> ''`;

  if (role === 'agent') {
    where += ' AND c.agent_id = ?';
    params.push(req.user.id);
  } else if (role === 'manager') {
    where += ' AND (c.agent_id = ? OR c.agent_id IN (SELECT id FROM users WHERE manager_id = ?))';
    params.push(req.user.id, req.user.id);
  } else if (role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [rows] = await pool.query(
    `${CARD_SELECT} ${where} ORDER BY pc.created_at DESC`,
    params,
  );

  res.json({
    items: rows.map((row) => {
      const card = toCard(row);
      return {
        id: card.id,
        title: card.title,
        liveUrl: card.liveUrl,
        client: card.client,
        clientId: card.clientId,
        clientAgentId: card.clientAgentId,
        clientAgentName: card.clientAgentName,
        type: card.type,
        dueDate: card.dueDate,
        createdAt: card.createdAt,
        assigneeName: card.assignee?.name || null,
      };
    }),
  });
}

export async function createCard(req, res) {
  const {
    title,
    client,
    clientId,
    type = 'draft',
    stage = 'new_draft',
    assigneeId,
    priority = 'none',
    description = '',
    dueDate,
    liveUrl = '',
    commentList,
    fileList,
    feedback,
  } = req.body || {};

  const titleTrim = String(title || '').trim();
  if (!titleTrim || titleTrim.length < 3) {
    return res.status(400).json({ error: 'Title must be at least 3 characters' });
  }
  if (titleTrim.length > 120) return res.status(400).json({ error: 'Title cannot exceed 120 characters' });
  if (!TYPES.has(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!STAGES.has(stage)) return res.status(400).json({ error: 'Invalid stage' });
  const priorityKey = priority === true ? 'high' : (priority === false ? 'none' : priority);
  if (!PRIORITIES.has(priorityKey)) return res.status(400).json({ error: 'Invalid priority' });
  if (!dueDate) return res.status(400).json({ error: 'Due date is required' });

  const safeAssigneeId = await assertAssignee(assigneeId);
  const resolved = await resolveClient(clientId, client, { requireId: true });
  const clientName = resolved.name;

  let url = normalizeUrl(liveUrl);
  if (stage === 'live') {
    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'A valid live link is required when stage is Live' });
    }
  } else if (url && !isValidUrl(url)) {
    return res.status(400).json({ error: 'Live link must be a valid http(s) URL' });
  } else if (!url) {
    url = null;
  }

  const extras = sanitizeExtras({ commentList, fileList, feedback });

  const [result] = await pool.query(
    `INSERT INTO production_cards
      (title, client, client_id, type, stage, assignee_id, priority, priority_key, description, live_url, extras_json, due_date, comments_count, attachments_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      titleTrim,
      clientName,
      resolved.id,
      type,
      stage,
      safeAssigneeId,
      priorityFlag(priorityKey),
      priorityKey,
      String(description || '').trim().slice(0, 2000) || null,
      url,
      JSON.stringify(extras),
      new Date(dueDate),
      extras.commentList.length,
      extras.fileList.length,
    ],
  );

  await syncClientProductionStatus(resolved.id);

  const [[row]] = await pool.query(`${CARD_SELECT} WHERE pc.id = ?`, [result.insertId]);
  res.status(201).json({ card: toCard(row) });
}

export async function updateCard(req, res) {
  const id = Number(req.params.id);
  const [[existing]] = await pool.query('SELECT * FROM production_cards WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Card not found' });

  const body = req.body || {};
  const next = {
    title: body.title !== undefined ? String(body.title).trim() : existing.title,
    type: body.type !== undefined ? body.type : existing.type,
    stage: body.stage !== undefined ? body.stage : existing.stage,
    assigneeId: body.assigneeId !== undefined ? Number(body.assigneeId) : existing.assignee_id,
    priority: body.priority !== undefined ? body.priority : (existing.priority_key || 'none'),
    description: body.description !== undefined ? String(body.description).trim() : existing.description,
    dueDate: body.dueDate !== undefined ? body.dueDate : existing.due_date,
    liveUrl: body.liveUrl !== undefined ? body.liveUrl : existing.live_url,
    clientId: body.clientId !== undefined ? body.clientId : existing.client_id,
    client: body.client !== undefined ? body.client : existing.client,
  };

  if (!next.title || next.title.length < 3) {
    return res.status(400).json({ error: 'Title must be at least 3 characters' });
  }
  if (next.title.length > 120) return res.status(400).json({ error: 'Title cannot exceed 120 characters' });
  if (!TYPES.has(next.type)) return res.status(400).json({ error: 'Invalid type' });
  if (!STAGES.has(next.stage)) return res.status(400).json({ error: 'Invalid stage' });
  const priorityKey = next.priority === true ? 'high' : (next.priority === false ? 'none' : next.priority);
  if (!PRIORITIES.has(priorityKey)) return res.status(400).json({ error: 'Invalid priority' });

  const safeAssigneeId = await assertAssignee(next.assigneeId, { allowId: existing.assignee_id });
  const resolved = await resolveClient(next.clientId, next.client, { requireId: true });
  const clientName = resolved.name;

  let url = normalizeUrl(next.liveUrl);
  if (next.stage === 'live') {
    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Add a valid live link before moving to Live' });
    }
  } else if (url && !isValidUrl(url)) {
    return res.status(400).json({ error: 'Live link must be a valid http(s) URL' });
  } else if (!url) {
    url = null;
  }

  const prevExtras = parseExtras(existing.extras_json);
  const extras = sanitizeExtras({
    commentList: body.commentList !== undefined ? body.commentList : prevExtras.commentList,
    fileList: body.fileList !== undefined ? body.fileList : prevExtras.fileList,
    feedback: body.feedback !== undefined ? body.feedback : prevExtras.feedback,
  });

  const prevClientId = existing.client_id;

  await pool.query(
    `UPDATE production_cards SET
      title = ?, client = ?, client_id = ?, type = ?, stage = ?, assignee_id = ?,
      priority = ?, priority_key = ?, description = ?, live_url = ?, extras_json = ?,
      due_date = ?, comments_count = ?, attachments_count = ?
     WHERE id = ?`,
    [
      next.title,
      clientName,
      resolved.id,
      next.type,
      next.stage,
      safeAssigneeId,
      priorityFlag(priorityKey),
      priorityKey,
      String(next.description || '').slice(0, 2000) || null,
      url,
      JSON.stringify(extras),
      new Date(next.dueDate),
      extras.commentList.length,
      extras.fileList.length,
      id,
    ],
  );

  await syncClientProductionStatus(resolved.id);
  if (prevClientId && Number(prevClientId) !== Number(resolved.id)) {
    await syncClientProductionStatus(prevClientId);
  }

  const [[row]] = await pool.query(`${CARD_SELECT} WHERE pc.id = ?`, [id]);
  const card = toCard(row);

  const prevPriority = existing.priority_key || (existing.priority ? 'high' : 'none');
  const stageChanged = existing.stage !== next.stage;
  const priorityChanged = prevPriority !== priorityKey;
  if (stageChanged || priorityChanged) {
    (async () => {
      const [[assignee]] = await pool.query(
        'SELECT whatsapp_number FROM users WHERE id = ?',
        [safeAssigneeId],
      );
      await notifyProductionCardChange({
        userId: card.assignee?.id,
        whatsappNumber: assignee?.whatsapp_number || null,
        cardTitle: card.title,
        clientName: card.client,
        assigneeName: card.assignee?.name,
        relatedCardId: card.id,
        prevStage: existing.stage,
        nextStage: next.stage,
        prevPriority,
        nextPriority: priorityKey,
      });
    })().catch((err) => {
      console.error('[production-update-notify]', err.message);
    });
  }

  res.json({ card });
}

export async function deleteCard(req, res) {
  const id = Number(req.params.id);
  const [[existing]] = await pool.query('SELECT client_id FROM production_cards WHERE id = ?', [id]);
  const [result] = await pool.query('DELETE FROM production_cards WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Card not found' });
  if (existing?.client_id) await syncClientProductionStatus(existing.client_id);
  res.status(204).end();
}
