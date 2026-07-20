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
