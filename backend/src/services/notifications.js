import { pool } from '../config/db.js';
import { isWasenderConfigured, sendWhatsAppText } from './wasender.js';
import { getWhatsAppPortalSettings } from './portalSettings.js';

export async function createNotification({
  userId = null,
  type = 'system',
  tone = 'blue',
  icon = 'i-bell',
  channel = 'app',
  title,
  body,
  relatedCardId = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO notifications
      (user_id, type, tone, icon, channel, title, body, related_card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, tone, icon, channel, title, body, relatedCardId]
  );
  return result.insertId;
}

export async function notifyUser({
  userId,
  whatsappNumber,
  type = 'system',
  tone = 'blue',
  icon = 'i-bell',
  title,
  body,
  relatedCardId = null,
  sendWhatsApp = true,
}) {
  const appId = await createNotification({
    userId,
    type,
    tone,
    icon,
    channel: 'app',
    title,
    body,
    relatedCardId,
  });

  const result = { notificationId: appId, whatsapp: { skipped: true } };

  if (!sendWhatsApp) return result;
  if (!whatsappNumber) {
    result.whatsapp = { skipped: true, reason: 'no_whatsapp_number' };
    return result;
  }
  if (!isWasenderConfigured()) {
    result.whatsapp = { skipped: true, reason: 'wasender_not_configured' };
    return result;
  }

  try {
    const sent = await sendWhatsAppText(whatsappNumber, `*${title}*\n\n${body}`);
    const waId = await createNotification({
      userId,
      type,
      tone,
      icon: 'i-whatsapp',
      channel: 'whatsapp',
      title,
      body,
      relatedCardId,
    });
    result.whatsapp = { ok: true, notificationId: waId, to: sent.to };
  } catch (err) {
    console.error('[whatsapp]', err.message);
    result.whatsapp = { ok: false, error: err.message };
  }

  return result;
}

async function notifyGroup({ title, body, type = 'attendance', tone = 'orange' }) {
  const settings = await getWhatsAppPortalSettings();
  if (!settings.groupJid) {
    return { skipped: true, reason: 'no_group_jid' };
  }
  if (!isWasenderConfigured()) {
    return { skipped: true, reason: 'wasender_not_configured' };
  }
  try {
    const sent = await sendWhatsAppText(settings.groupJid, `*${title}*\n\n${body}`);
    await createNotification({
      userId: null,
      type,
      tone,
      icon: 'i-whatsapp',
      channel: 'whatsapp',
      title: `[Group] ${title}`,
      body,
    });
    return { ok: true, to: sent.to };
  } catch (err) {
    console.error('[whatsapp-group]', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Late check-in → individuals (optional) + WhatsApp group (optional).
 */
export async function notifyLateCheckIn({ userId, userName, checkInDisplay }) {
  const [[user]] = await pool.query(
    `SELECT id, name, whatsapp_number, manager_id FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) return { sent: [], group: null };

  const settings = await getWhatsAppPortalSettings();
  const title = 'Late check-in';
  const body = `${userName || user.name} checked in late at ${checkInDisplay}.`;
  const sent = [];

  if (settings.notifyLateIndividuals) {
    const recipients = new Map();
    recipients.set(user.id, {
      userId: user.id,
      whatsappNumber: user.whatsapp_number,
      label: 'self',
    });

    if (user.manager_id) {
      const [[mgr]] = await pool.query(
        `SELECT id, whatsapp_number FROM users WHERE id = ? AND is_active = 1`,
        [user.manager_id]
      );
      if (mgr) {
        recipients.set(mgr.id, {
          userId: mgr.id,
          whatsappNumber: mgr.whatsapp_number,
          label: 'manager',
        });
      }
    }

    const [admins] = await pool.query(
      `SELECT id, whatsapp_number FROM users WHERE role = 'admin' AND is_active = 1`
    );
    for (const admin of admins) {
      if (!recipients.has(admin.id)) {
        recipients.set(admin.id, {
          userId: admin.id,
          whatsappNumber: admin.whatsapp_number,
          label: 'admin',
        });
      }
    }

    for (const recipient of recipients.values()) {
      const outcome = await notifyUser({
        userId: recipient.userId,
        whatsappNumber: recipient.whatsappNumber,
        type: 'attendance',
        tone: 'orange',
        icon: 'i-alert',
        title,
        body,
        sendWhatsApp: true,
      });
      sent.push({ ...recipient, ...outcome });
    }
  } else {
    // Still create in-app for the late user
    await createNotification({
      userId: user.id,
      type: 'attendance',
      tone: 'orange',
      icon: 'i-alert',
      channel: 'app',
      title,
      body,
    });
  }

  let group = null;
  if (settings.notifyLateGroup) {
    group = await notifyGroup({ title, body });
  }

  return { sent, group };
}

export async function notifyDeadline({
  userId,
  whatsappNumber,
  title,
  body,
  relatedCardId = null,
}) {
  const settings = await getWhatsAppPortalSettings();
  const personal = await notifyUser({
    userId,
    whatsappNumber,
    type: 'deadline',
    tone: 'orange',
    icon: 'i-production',
    title,
    body,
    relatedCardId,
    sendWhatsApp: true,
  });

  let group = null;
  if (settings.notifyDeadlinesGroup) {
    group = await notifyGroup({ title, body, type: 'deadline', tone: 'orange' });
  }

  return { ...personal, group };
}

const STAGE_LABELS = {
  new_project_create_draft: 'New Project / Create Draft',
  page_expansion: 'Page Expansion',
  draft_done: 'Draft Done',
  draft_revisions: 'Draft Revisions / Comments',
  pending_approval: 'Pending for Approval',
  push_to_live: 'Push Page to Live',
  page_live: 'Page Live',
  edits_after_publishing: 'Edits After Publishing',
  pages_to_relive: 'Pages to Re-live',
  stopped_process: 'Stopped Process',
  // legacy
  new_draft: 'New Draft',
  in_progress: 'In Progress',
  revision: 'Revision',
  review: 'Review',
  live: 'Live',
  done: 'Done',
};

const PRIORITY_LABELS = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

function stageLabel(stage) {
  const key = String(stage || '').trim();
  if (!key) return 'Unknown';
  return STAGE_LABELS[key] || key.replaceAll('_', ' ');
}

function priorityLabel(priority) {
  return PRIORITY_LABELS[priority] || String(priority || 'None');
}

const LEGACY_STAGE_MAP = {
  new_draft: 'new_project_create_draft',
  in_progress: 'page_expansion',
  revision: 'draft_revisions',
  review: 'pending_approval',
  live: 'page_live',
  done: 'stopped_process',
};

function normalizeStageKey(stage) {
  const key = String(stage || '').trim();
  return LEGACY_STAGE_MAP[key] || key;
}

function feedbackStatusLabel(status) {
  const map = {
    none: 'None',
    pending: 'Pending',
    approved: 'Approved',
    changes_requested: 'Changes requested',
  };
  return map[status] || String(status || 'None').replaceAll('_', ' ');
}

function clipText(value, max = 400) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function cardHeaderLines({ cardTitle, clientName, assigneeName, actorName }) {
  const lines = [`"${cardTitle}" for ${clientName}`];
  if (assigneeName) lines.push(`Assignee: ${assigneeName}`);
  if (actorName) lines.push(`By: ${actorName}`);
  return lines;
}

/**
 * Diff card update into concrete activity events with dynamic message bodies.
 */
export function buildProductionCardEvents({
  cardTitle,
  clientName,
  assigneeName = null,
  actorName = null,
  prevStage,
  nextStage,
  prevPriority,
  nextPriority,
  prevExtras = {},
  nextExtras = {},
}) {
  const events = [];
  const base = { cardTitle, clientName, assigneeName, actorName };

  const prevStageKey = normalizeStageKey(prevStage);
  const nextStageKey = normalizeStageKey(nextStage);
  // Ignore empty/unknown → stage noise (was producing "Stage:  → …" on every save).
  const stageChanged = Boolean(prevStageKey && nextStageKey && prevStageKey !== nextStageKey);
  const priorityChanged = String(prevPriority || 'none') !== String(nextPriority || 'none');

  const prevComments = Array.isArray(prevExtras.commentList) ? prevExtras.commentList : [];
  const nextComments = Array.isArray(nextExtras.commentList) ? nextExtras.commentList : [];
  const prevCommentIds = new Set(prevComments.map((c) => String(c.id)));
  const addedComments = nextComments.filter((c) => !prevCommentIds.has(String(c.id)));
  for (const comment of addedComments) {
    const text = clipText(comment.text || comment.body || '');
    if (!text) continue;
    const lines = cardHeaderLines(base);
    lines.push('', 'Comment:', text);
    events.push({
      title: 'New comment',
      body: lines.join('\n'),
      tone: 'blue',
      icon: 'i-message',
    });
  }

  const prevFiles = Array.isArray(prevExtras.fileList) ? prevExtras.fileList : [];
  const nextFiles = Array.isArray(nextExtras.fileList) ? nextExtras.fileList : [];
  const prevFileIds = new Set(prevFiles.map((f) => String(f.id)));
  const addedFiles = nextFiles.filter((f) => !prevFileIds.has(String(f.id)));
  if (addedFiles.length) {
    const lines = cardHeaderLines(base);
    lines.push(`Files added (${addedFiles.length}):`);
    for (const file of addedFiles.slice(0, 5)) {
      lines.push(`• ${file.name || 'file'}`);
    }
    if (addedFiles.length > 5) lines.push(`• +${addedFiles.length - 5} more`);
    events.push({
      title: addedFiles.length === 1 ? 'File uploaded' : 'Files uploaded',
      body: lines.join('\n'),
      tone: 'blue',
      icon: 'i-paperclip',
    });
  }

  const prevDeliveries = Array.isArray(prevExtras.deliveryList) ? prevExtras.deliveryList : [];
  const nextDeliveries = Array.isArray(nextExtras.deliveryList) ? nextExtras.deliveryList : [];
  const prevDeliveryById = new Map(prevDeliveries.map((d) => [String(d.id), d]));
  const nextDeliveryById = new Map(nextDeliveries.map((d) => [String(d.id), d]));

  for (const delivery of nextDeliveries) {
    const id = String(delivery.id);
    if (prevDeliveryById.has(id)) continue;
    const lines = cardHeaderLines(base);
    const description = clipText(delivery.description || '');
    if (description) {
      lines.push('', 'Description:', description);
    }
    if (delivery.url) lines.push(`Link: ${delivery.url}`);
    const fileNames = Array.isArray(delivery.files) && delivery.files.length
      ? delivery.files.map((f) => f?.name).filter(Boolean)
      : (delivery.name ? [delivery.name] : []);
    if (fileNames.length === 1) lines.push(`File: ${fileNames[0]}`);
    if (fileNames.length > 1) {
      lines.push(`Files (${fileNames.length}):`);
      for (const name of fileNames.slice(0, 5)) lines.push(`• ${name}`);
    }
    if (!description && !delivery.url && !fileNames.length) {
      lines.push('', 'A delivery was added.');
    }
    events.push({
      title: 'Delivery added',
      body: lines.join('\n'),
      tone: 'green',
      icon: 'i-link',
    });
  }

  for (const delivery of prevDeliveries) {
    const id = String(delivery.id);
    if (nextDeliveryById.has(id)) continue;
    const lines = cardHeaderLines(base);
    const description = clipText(delivery.description || delivery.name || 'Delivery');
    lines.push(`Removed: ${description}`);
    events.push({
      title: 'Delivery removed',
      body: lines.join('\n'),
      tone: 'orange',
      icon: 'i-link',
    });
  }

  for (const delivery of nextDeliveries) {
    const prev = prevDeliveryById.get(String(delivery.id));
    if (!prev) continue;
    const prevFb = prev.feedback || {};
    const nextFb = delivery.feedback || {};
    const statusChanged = String(prevFb.status || 'none') !== String(nextFb.status || 'none');
    const noteChanged = String(prevFb.note || '').trim() !== String(nextFb.note || '').trim();
    if (!statusChanged && !noteChanged) continue;
    if (String(nextFb.status || 'none') === 'none' && !String(nextFb.note || '').trim()) continue;

    const lines = cardHeaderLines(base);
    const deliveryLabel = clipText(delivery.description || delivery.name || 'Delivery', 160);
    lines.push(`Delivery: ${deliveryLabel}`);
    lines.push(`Status: ${feedbackStatusLabel(nextFb.status)}`);
    const note = clipText(nextFb.note || '');
    if (note) {
      lines.push('', 'Feedback:', note);
    }
    events.push({
      title: 'Delivery feedback',
      body: lines.join('\n'),
      tone: nextFb.status === 'approved' ? 'green' : nextFb.status === 'changes_requested' ? 'orange' : 'blue',
      icon: 'i-star',
    });
  }

  const prevFb = prevExtras.feedback || {};
  const nextFb = nextExtras.feedback || {};
  const cardFbStatusChanged = String(prevFb.status || 'none') !== String(nextFb.status || 'none');
  const cardFbNoteChanged = String(prevFb.note || '').trim() !== String(nextFb.note || '').trim();
  const cardFbRatingChanged = String(prevFb.rating ?? '') !== String(nextFb.rating ?? '');
  if (cardFbStatusChanged || cardFbNoteChanged || cardFbRatingChanged) {
    if (!(String(nextFb.status || 'none') === 'none' && !String(nextFb.note || '').trim() && (nextFb.rating == null || nextFb.rating === ''))) {
      const lines = cardHeaderLines(base);
      lines.push(`Status: ${feedbackStatusLabel(nextFb.status)}`);
      if (nextFb.rating != null && nextFb.rating !== '') {
        lines.push(`Rating: ${nextFb.rating}/5`);
      }
      const note = clipText(nextFb.note || '');
      if (note) {
        lines.push('', 'Note:', note);
      }
      events.push({
        title: 'Client feedback updated',
        body: lines.join('\n'),
        tone: nextFb.status === 'approved' ? 'green' : nextFb.status === 'changes_requested' ? 'orange' : 'blue',
        icon: 'i-star',
      });
    }
  }

  // Real stage/priority moves only — never spam this on comment/delivery saves.
  if (stageChanged || priorityChanged) {
    const lines = cardHeaderLines(base);
    if (stageChanged) {
      lines.push(`Stage: ${stageLabel(prevStageKey)} → ${stageLabel(nextStageKey)}`);
    }
    if (priorityChanged) {
      lines.push(`Priority: ${priorityLabel(prevPriority)} → ${priorityLabel(nextPriority)}`);
    }
    if (!stageChanged && nextStageKey) lines.push(`Stage: ${stageLabel(nextStageKey)}`);
    if (!priorityChanged && nextPriority && nextPriority !== 'none') {
      lines.push(`Priority: ${priorityLabel(nextPriority)}`);
    }
    let title = 'Card updated';
    if (stageChanged && !priorityChanged) title = 'Stage updated';
    if (priorityChanged && !stageChanged) title = 'Priority updated';
    events.push({
      title,
      body: lines.join('\n'),
      tone: priorityChanged && nextPriority === 'high' ? 'red' : 'blue',
      icon: 'i-production',
    });
  }

  return events;
}

/**
 * Stage / priority / comment / delivery / feedback → assignee DM + optional group.
 * Sends one WhatsApp/app notification per concrete activity (dynamic body).
 */
export async function notifyProductionCardChange({
  userId,
  whatsappNumber,
  cardTitle,
  clientName,
  assigneeName,
  actorName = null,
  relatedCardId = null,
  prevStage,
  nextStage,
  prevPriority,
  nextPriority,
  prevExtras = {},
  nextExtras = {},
  events: providedEvents = null,
}) {
  const events = Array.isArray(providedEvents)
    ? providedEvents
    : buildProductionCardEvents({
        cardTitle,
        clientName,
        assigneeName,
        actorName,
        prevStage,
        nextStage,
        prevPriority,
        nextPriority,
        prevExtras,
        nextExtras,
      });

  if (!events.length) {
    return { skipped: true, reason: 'no_notifiable_changes' };
  }

  const settings = await getWhatsAppPortalSettings();
  const results = [];

  for (const event of events) {
    const personal = await notifyUser({
      userId,
      whatsappNumber,
      type: 'system',
      tone: event.tone || 'blue',
      icon: event.icon || 'i-production',
      title: event.title,
      body: event.body,
      relatedCardId,
      sendWhatsApp: true,
    });

    let group = null;
    if (settings.notifyCardUpdatesGroup) {
      group = await notifyGroup({
        title: event.title,
        body: event.body,
        type: 'system',
        tone: event.tone || 'blue',
      });
    }
    results.push({ ...personal, group, title: event.title });
  }

  return { ok: true, count: results.length, results };
}

/**
 * New production card / push-to-board → assignee DM + optional WhatsApp group.
 */
export async function notifyProductionCardCreated({
  userId,
  whatsappNumber,
  cardTitle,
  clientName,
  assigneeName,
  stage,
  type,
  priority,
  dueDate = null,
  relatedCardId = null,
  fileCount = 0,
  description = null,
}) {
  const title = type === 'revision' ? 'Revision pushed to production' : 'Draft pushed to production';
  const lines = [
    `"${cardTitle}" for ${clientName}`,
    `Stage: ${stageLabel(stage)}`,
    `Type: ${type === 'revision' ? 'Revision' : 'Draft'}`,
  ];
  if (priority && priority !== 'none') {
    lines.push(`Priority: ${priorityLabel(priority)}`);
  }
  if (assigneeName) lines.push(`Assignee: ${assigneeName}`);
  if (dueDate) {
    const due = new Date(dueDate);
    if (!Number.isNaN(due.getTime())) {
      lines.push(`Due: ${due.toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })}`);
    }
  }
  if (fileCount > 0) {
    lines.push(`Attachments: ${fileCount}`);
  }
  const desc = clipText(description, 300);
  if (desc) {
    lines.push('', 'Description:', desc);
  }

  const body = lines.join('\n');
  const settings = await getWhatsAppPortalSettings();

  const personal = await notifyUser({
    userId,
    whatsappNumber,
    type: 'system',
    tone: 'green',
    icon: 'i-production',
    title,
    body,
    relatedCardId,
    sendWhatsApp: true,
  });

  let group = null;
  if (settings.notifyCardUpdatesGroup) {
    group = await notifyGroup({ title, body, type: 'system', tone: 'green' });
  }

  return { ...personal, group };
}
