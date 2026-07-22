import {
  getWasenderPublicConfig,
  getWasenderStatus,
  isGroupJid,
  isWasenderConfigured,
  listWasenderGroups,
  sendWhatsAppText,
} from '../services/wasender.js';
import {
  getWhatsAppPortalSettings,
  saveWhatsAppPortalSettings,
} from '../services/portalSettings.js';
import { createNotification, notifyUser } from '../services/notifications.js';
import { normalisePhone } from '../utils/phone.js';
import { pool } from '../config/db.js';
import { RULES } from '../utils/attendanceRules.js';
import { getOfficeGeofenceConfig } from '../utils/geofence.js';

const ALLOWED_BROADCAST_ROLES = new Set(['admin', 'manager', 'agent', 'production']);
const MAX_BROADCAST_RECIPIENTS = 50;
const BROADCAST_DELAY_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRecipient(raw) {
  const input = String(raw || '').trim();
  if (!input) return { error: 'Provide a phone number, group JID, or userId' };
  if (isGroupJid(input)) return { value: input };
  const normalised = normalisePhone(input);
  if (normalised.error) {
    const digits = input.replace(/\D/g, '');
    if (/^[1-9]\d{7,14}$/.test(digits)) return { value: `+${digits}` };
    return { error: normalised.error };
  }
  return { value: normalised.value };
}

/** GET /api/settings — attendance rules + WhatsApp portal config + Wasender status */
export async function getPortalSettings(req, res) {
  const waPortal = await getWhatsAppPortalSettings();
  const publicConfig = getWasenderPublicConfig();

  let live = null;
  let groups = [];
  let waError = null;
  if (isWasenderConfigured()) {
    try {
      live = await getWasenderStatus();
    } catch (err) {
      waError = err.message;
    }
    try {
      groups = await listWasenderGroups();
    } catch {
      groups = [];
    }
  }

  res.json({
    attendance: {
      lateCutoff: `${String(RULES.lateCutoffHour).padStart(2, '0')}:${String(RULES.lateCutoffMinute).padStart(2, '0')} Asia/Karachi`,
      lateCutoffHour: RULES.lateCutoffHour,
      lateCutoffMinute: RULES.lateCutoffMinute,
      lateCountForAutoOff: RULES.lateCountForAutoOff,
      freeOffsPerMonth: RULES.freeOffsPerMonth,
      draftDeadlineDays: 4,
      revisionDeadlineDays: 2,
      geofence: getOfficeGeofenceConfig(),
    },
    whatsapp: {
      ...publicConfig,
      ...waPortal,
      live,
      groups,
      error: waError,
      hint: publicConfig.configured
        ? null
        : 'Set WASENDER_API_KEY in backend/.env (from Wasender session → API Key).',
    },
  });
}

/** PATCH /api/settings/whatsapp */
export async function updateWhatsAppSettings(req, res) {
  const {
    groupJid,
    notifyLateIndividuals,
    notifyLateGroup,
    notifyDeadlinesGroup,
    notifyCardUpdatesGroup,
  } = req.body || {};

  if (groupJid !== undefined && groupJid !== null && String(groupJid).trim()) {
    const jid = String(groupJid).trim();
    if (!isGroupJid(jid) && !/^\d{10,}@g\.us$/i.test(jid)) {
      // Allow pasting id without @g.us — auto-append
      if (/^\d{10,}$/.test(jid)) {
        // ok — we'll store with @g.us below
      } else if (!isGroupJid(jid)) {
        return res.status(400).json({
          error: 'Group ID must look like 1203630…@g.us',
        });
      }
    }
  }

  let normalisedGroup = groupJid;
  if (groupJid !== undefined && groupJid !== null) {
    const jid = String(groupJid).trim();
    if (jid && /^\d{10,}$/.test(jid)) normalisedGroup = `${jid}@g.us`;
    else normalisedGroup = jid;
  }

  const saved = await saveWhatsAppPortalSettings({
    groupJid: normalisedGroup,
    notifyLateIndividuals,
    notifyLateGroup,
    notifyDeadlinesGroup,
    notifyCardUpdatesGroup,
  });

  res.json({ ok: true, whatsapp: saved });
}

/** POST /api/settings/whatsapp/test — DM or group */
export async function testWhatsAppSettings(req, res) {
  if (!isWasenderConfigured()) {
    return res.status(503).json({
      error: 'Wasender is not configured. Add WASENDER_API_KEY to backend/.env',
    });
  }

  let to = req.body?.to != null ? String(req.body.to).trim() : '';
  const useGroup = Boolean(req.body?.useGroup);
  const userId = req.body?.userId != null ? Number(req.body.userId) : null;
  const text = String(
    req.body?.text ||
      'Test from The Wiki Studio CRM — WhatsApp settings OK.'
  ).trim();

  if (useGroup) {
    const settings = await getWhatsAppPortalSettings();
    to = settings.groupJid;
    if (!to) {
      return res.status(400).json({ error: 'Save a WhatsApp Group ID first' });
    }
  } else if (userId) {
    const [[user]] = await pool.query(
      'SELECT id, name, whatsapp_number FROM users WHERE id = ?',
      [userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.whatsapp_number) {
      return res.status(400).json({ error: `${user.name} has no WhatsApp number` });
    }
    to = user.whatsapp_number;
  }

  const resolved = resolveRecipient(to);
  if (resolved.error) return res.status(400).json({ error: resolved.error });

  try {
    const sent = await sendWhatsAppText(resolved.value, text);
    await createNotification({
      userId: userId || req.user.id,
      type: 'system',
      tone: 'green',
      icon: 'i-whatsapp',
      channel: 'whatsapp',
      title: sent.isGroup ? 'WhatsApp group test sent' : 'WhatsApp test sent',
      body: text,
    });
    return res.json({ ok: true, to: sent.to, isGroup: sent.isGroup });
  } catch (err) {
    return res.status(err.status && err.status < 600 ? err.status : 502).json({
      error: err.message || 'Failed to send',
      details: err.details || null,
    });
  }
}

/**
 * POST /api/settings/whatsapp/send
 * Custom compose: group | selected users | roles broadcast.
 */
export async function sendWhatsAppBroadcast(req, res) {
  if (!isWasenderConfigured()) {
    return res.status(503).json({
      error: 'Wasender is not configured. Add WASENDER_API_KEY to backend/.env',
    });
  }

  const target = String(req.body?.target || '').trim();
  const title = String(req.body?.title || 'Message from The Wiki Studio').trim().slice(0, 200);
  const text = String(req.body?.text || '').trim();

  if (!text) {
    return res.status(400).json({ error: 'Message text is required' });
  }
  if (text.length > 4096) {
    return res.status(400).json({ error: 'Message is too long (max 4096 characters)' });
  }
  if (!['group', 'users', 'roles'].includes(target)) {
    return res.status(400).json({ error: 'target must be group, users, or roles' });
  }

  const message = title ? `*${title}*\n\n${text}` : text;
  const results = { sent: 0, skipped: 0, failed: 0, details: [] };

  if (target === 'group') {
    const settings = await getWhatsAppPortalSettings();
    if (!settings.groupJid) {
      return res.status(400).json({ error: 'Save a WhatsApp Group ID first' });
    }
    try {
      const sent = await sendWhatsAppText(settings.groupJid, message);
      await createNotification({
        userId: req.user.id,
        type: 'system',
        tone: 'green',
        icon: 'i-whatsapp',
        channel: 'whatsapp',
        title: `[Group] ${title}`,
        body: text,
      });
      results.sent = 1;
      results.details.push({ to: sent.to, ok: true, isGroup: true });
    } catch (err) {
      results.failed = 1;
      results.details.push({ to: settings.groupJid, ok: false, error: err.message });
    }
    return res.json({ ok: results.failed === 0, ...results });
  }

  let recipients = [];

  if (target === 'users') {
    const rawIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    const ids = [...new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!ids.length) {
      return res.status(400).json({ error: 'Select at least one user' });
    }
    if (ids.length > MAX_BROADCAST_RECIPIENTS) {
      return res.status(400).json({
        error: `You can message at most ${MAX_BROADCAST_RECIPIENTS} users at once`,
      });
    }
    const [rows] = await pool.query(
      `SELECT id, name, whatsapp_number, role
       FROM users
       WHERE id IN (${ids.map(() => '?').join(',')}) AND is_active = 1`,
      ids
    );
    recipients = rows;
  } else {
    const rawRoles = Array.isArray(req.body?.roles) ? req.body.roles : [];
    const roles = [...new Set(rawRoles.map((r) => String(r).trim()).filter((r) => ALLOWED_BROADCAST_ROLES.has(r)))];
    if (!roles.length) {
      return res.status(400).json({ error: 'Select at least one role' });
    }
    const [rows] = await pool.query(
      `SELECT id, name, whatsapp_number, role
       FROM users
       WHERE is_active = 1
         AND role IN (${roles.map(() => '?').join(',')})
         AND whatsapp_number IS NOT NULL
         AND TRIM(whatsapp_number) <> ''
       ORDER BY FIELD(role, 'admin', 'manager', 'agent', 'production'), name
       LIMIT ?`,
      [...roles, MAX_BROADCAST_RECIPIENTS]
    );
    recipients = rows;
    if (!recipients.length) {
      return res.status(400).json({
        error: 'No active users with WhatsApp numbers for the selected roles',
      });
    }
  }

  for (let i = 0; i < recipients.length; i += 1) {
    const user = recipients[i];
    if (!user.whatsapp_number) {
      results.skipped += 1;
      results.details.push({
        userId: user.id,
        name: user.name,
        ok: false,
        skipped: true,
        reason: 'no_whatsapp_number',
      });
      continue;
    }

    try {
      const outcome = await notifyUser({
        userId: user.id,
        whatsappNumber: user.whatsapp_number,
        type: 'system',
        tone: 'blue',
        icon: 'i-whatsapp',
        title,
        body: text,
        sendWhatsApp: true,
      });
      if (outcome.whatsapp?.ok) {
        results.sent += 1;
        results.details.push({
          userId: user.id,
          name: user.name,
          ok: true,
          to: outcome.whatsapp.to,
        });
      } else if (outcome.whatsapp?.skipped) {
        results.skipped += 1;
        results.details.push({
          userId: user.id,
          name: user.name,
          ok: false,
          skipped: true,
          reason: outcome.whatsapp.reason || 'skipped',
        });
      } else {
        results.failed += 1;
        results.details.push({
          userId: user.id,
          name: user.name,
          ok: false,
          error: outcome.whatsapp?.error || 'Send failed',
        });
      }
    } catch (err) {
      results.failed += 1;
      results.details.push({
        userId: user.id,
        name: user.name,
        ok: false,
        error: err.message,
      });
    }

    if (i < recipients.length - 1) {
      await sleep(BROADCAST_DELAY_MS);
    }
  }

  await createNotification({
    userId: req.user.id,
    type: 'system',
    tone: results.failed ? 'orange' : 'green',
    icon: 'i-whatsapp',
    channel: 'app',
    title: 'WhatsApp broadcast finished',
    body: `Sent ${results.sent}, skipped ${results.skipped}, failed ${results.failed}.`,
  });

  return res.json({
    ok: results.failed === 0 && results.sent > 0,
    ...results,
  });
}
