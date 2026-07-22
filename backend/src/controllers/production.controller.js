import { pool } from '../config/db.js';
import { notifyProductionCardChange, notifyProductionCardCreated } from '../services/notifications.js';

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

/** Strip payment / deal lines so production never sees money in card text. */
function sanitizeDescriptionForProduction(description) {
  return String(description || '')
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^client payments\b/i.test(t)) return false;
      if (/\b(deal|received|remaining|balance)\b/i.test(t) && /\$|usd|\d/i.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapDeliveryList(raw, { light = false } = {}) {
  const list = Array.isArray(raw) ? raw : [];
  if (!light) return list;
  return list.map((item) => {
    if (item?.kind !== 'file') return item;
    return {
      ...item,
      // Omit base64 data URLs from list payloads (huge).
      url: typeof item.url === 'string' && item.url.startsWith('data:') ? null : item.url,
    };
  });
}

function toCard(row, { light = false, role = null } = {}) {
  const extras = parseExtras(row.extras_json);
  const assigneeId = row.assignee_id;
  const rawFiles = extras.fileList || [];
  const fileList = light
    ? rawFiles.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        uploadedAt: f.uploadedAt,
        // Omit base64 data URLs from list payloads (huge).
        url: typeof f.url === 'string' && f.url.startsWith('data:') ? null : f.url,
      }))
    : rawFiles;

  const isProduction = role === 'production';
  const description = isProduction
    ? sanitizeDescriptionForProduction(row.description)
    : (row.description || '');

  const card = {
    id: row.id,
    title: row.title,
    client: row.client,
    clientId: row.client_id ?? null,
    type: row.type,
    stage: row.stage,
    assignee: {
      id: assigneeId,
      name: row.assignee_name || 'Unassigned',
      email: row.assignee_email || '',
      avatar: pickAvatar(assigneeId),
    },
    priority: row.priority_key || 'none',
    description,
    liveUrl: row.live_url || '',
    createdAt: row.created_at,
    dueDate: row.due_date,
    comments: Number(row.comments_count || 0),
    attachments: Number(row.attachments_count || 0),
    commentList: light ? (extras.commentList || []).slice(-20) : (extras.commentList || []),
    fileList,
    deliveryList: mapDeliveryList(extras.deliveryList, { light }),
    feedback: extras.feedback || {
      status: 'none',
      note: '',
      rating: null,
      updatedAt: null,
      author: null,
    },
  };

  // Agent ownership is admin/CRM-only — never expose to production.
  if (!isProduction) {
    card.clientAgentId = row.client_agent_id ?? null;
    card.clientAgentName = row.client_agent_name ?? null;
  }

  return card;
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

function sanitizeFileAttachment(f, { totalBytes, label = 'Attachment' } = {}) {
  const name = String(f?.name || '').trim();
  const size = Number(f?.size || 0);
  const ext = name.toLowerCase().split('.').pop() || '';
  if (!name || !ALLOWED_FILE_EXT.has(ext)) {
    const err = new Error(`${label} "${name || 'file'}" type is not allowed`);
    err.status = 400;
    throw err;
  }
  if (!(size > 0) || size > 5 * 1024 * 1024) {
    const err = new Error(`${label} "${name}" must be between 1 byte and 5 MB`);
    err.status = 400;
    throw err;
  }
  const nextTotal = Number(totalBytes || 0) + size;
  if (nextTotal > 8 * 1024 * 1024) {
    const err = new Error(`${label}s together cannot exceed 8 MB`);
    err.status = 400;
    throw err;
  }
  const url = String(f?.url || '');
  if (url && !url.startsWith('data:') && !/^https?:\/\//i.test(url)) {
    const err = new Error(`${label} "${name}" has an invalid URL`);
    err.status = 400;
    throw err;
  }
  return {
    file: {
      id: f.id ?? Date.now(),
      name,
      size,
      type: String(f.type || 'application/octet-stream'),
      url: url || null,
      uploadedAt: f.uploadedAt || new Date().toISOString(),
    },
    totalBytes: nextTotal,
  };
}

function sanitizeDeliveryList(deliveryList) {
  const itemsIn = Array.isArray(deliveryList) ? deliveryList : [];
  if (itemsIn.length > 5) {
    const err = new Error('A card can have at most 5 deliveries');
    err.status = 400;
    throw err;
  }

  const items = [];
  let totalBytes = 0;
  for (const raw of itemsIn) {
    const kind = raw?.kind === 'file' ? 'file' : raw?.kind === 'link' ? 'link' : null;
    if (!kind) {
      const err = new Error('Each delivery must be a link or a file');
      err.status = 400;
      throw err;
    }
    const label = String(raw?.label || '').trim().slice(0, 120);
    const createdAt = raw.createdAt || new Date().toISOString();
    const id = raw.id ?? Date.now();

    if (kind === 'link') {
      const url = normalizeUrl(raw.url);
      if (!isValidUrl(url)) {
        const err = new Error('Delivery link must be a valid http(s) URL');
        err.status = 400;
        throw err;
      }
      items.push({
        id,
        kind: 'link',
        label: label || url,
        url,
        createdAt,
      });
      continue;
    }

    const { file, totalBytes: nextBytes } = sanitizeFileAttachment(raw, {
      totalBytes,
      label: 'Delivery file',
    });
    totalBytes = nextBytes;
    items.push({
      id,
      kind: 'file',
      label: label || file.name,
      name: file.name,
      size: file.size,
      type: file.type,
      url: file.url,
      createdAt,
    });
  }
  return items;
}

function sanitizeExtras({ commentList, fileList, feedback, deliveryList }) {
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
    const { file, totalBytes: nextBytes } = sanitizeFileAttachment(f, { totalBytes });
    totalBytes = nextBytes;
    files.push(file);
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

  return {
    commentList: comments,
    fileList: files,
    feedback: fb,
    deliveryList: sanitizeDeliveryList(deliveryList),
  };
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
  const role = req.user?.role || null;
  res.json({ cards: rows.map((row) => toCard(row, { light: true, role })) });
}

/** GET /api/production/cards/:id — full card including file data URLs */
export async function getCard(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid card id' });
  }
  const [[row]] = await pool.query(`${CARD_SELECT} WHERE pc.id = ?`, [id]);
  if (!row) return res.status(404).json({ error: 'Card not found' });
  res.json({ card: toCard(row, { light: false, role: req.user?.role || null }) });
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
    deliveryList,
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

  const extras = sanitizeExtras({ commentList, fileList, feedback, deliveryList });

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
  const card = toCard(row, { role: req.user?.role || null });

  (async () => {
    const [[assignee]] = await pool.query(
      'SELECT whatsapp_number FROM users WHERE id = ?',
      [safeAssigneeId],
    );
    await notifyProductionCardCreated({
      userId: card.assignee?.id,
      whatsappNumber: assignee?.whatsapp_number || null,
      cardTitle: card.title,
      clientName: card.client,
      assigneeName: card.assignee?.name,
      stage: card.stage,
      type: card.type,
      priority: card.priority,
      dueDate: card.dueDate,
      relatedCardId: card.id,
      fileCount: Array.isArray(card.fileList) ? card.fileList.length : 0,
    });
  })().catch((err) => {
    console.error('[production-create-notify]', err.message);
  });

  res.status(201).json({ card });
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
    deliveryList: body.deliveryList !== undefined ? body.deliveryList : prevExtras.deliveryList,
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
  const card = toCard(row, { role: req.user?.role || null });

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
