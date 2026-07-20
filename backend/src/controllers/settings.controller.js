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
import { createNotification } from '../services/notifications.js';
import { normalisePhone } from '../utils/phone.js';
import { pool } from '../config/db.js';
import { RULES } from '../utils/attendanceRules.js';

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
