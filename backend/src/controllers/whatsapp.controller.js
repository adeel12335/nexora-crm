import { pool } from '../config/db.js';
import { normalisePhone } from '../utils/phone.js';
import {
  getWasenderPublicConfig,
  getWasenderStatus,
  isWasenderConfigured,
  sendWhatsAppText,
} from '../services/wasender.js';
import { createNotification } from '../services/notifications.js';

function resolveRecipient(raw) {
  const input = String(raw || '').trim();
  if (!input) return { error: 'Provide a phone number (to) or userId' };
  const normalised = normalisePhone(input);
  if (normalised.error) {
    const digits = input.replace(/\D/g, '');
    if (/^[1-9]\d{7,14}$/.test(digits)) return { value: `+${digits}` };
    return { error: normalised.error };
  }
  return { value: normalised.value };
}

/** GET /api/whatsapp/status */
export async function whatsappStatus(req, res) {
  const publicConfig = getWasenderPublicConfig();
  if (!isWasenderConfigured()) {
    return res.json({
      ...publicConfig,
      live: null,
      hint: 'Set WASENDER_API_KEY in backend/.env (copy from Wasender session → API Key).',
    });
  }

  try {
    const live = await getWasenderStatus();
    return res.json({ ...publicConfig, live, hint: null });
  } catch (err) {
    return res.json({
      ...publicConfig,
      live: null,
      error: err.message,
      hint: 'Check that the session is connected and the API key matches this session.',
    });
  }
}

/**
 * POST /api/whatsapp/test
 * Body: { to?: string, userId?: number, text?: string }
 */
export async function whatsappTest(req, res) {
  if (!isWasenderConfigured()) {
    return res.status(503).json({
      error: 'Wasender is not configured. Add WASENDER_API_KEY to backend/.env',
    });
  }

  let to = req.body?.to != null ? String(req.body.to).trim() : '';
  const userId = req.body?.userId != null ? Number(req.body.userId) : null;
  const text = String(
    req.body?.text ||
      'Test message from The Wiki Studio CRM — WhatsApp notifications are connected.'
  ).trim();

  if (userId) {
    const [[user]] = await pool.query(
      'SELECT id, name, whatsapp_number FROM users WHERE id = ?',
      [userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.whatsapp_number) {
      return res.status(400).json({ error: `${user.name} has no WhatsApp number on file` });
    }
    to = user.whatsapp_number;
  }

  const resolved = resolveRecipient(to);
  if (resolved.error) return res.status(400).json({ error: resolved.error });
  to = resolved.value;

  try {
    const sent = await sendWhatsAppText(to, text);
    await createNotification({
      userId: userId || req.user.id,
      type: 'system',
      tone: 'green',
      icon: 'i-whatsapp',
      channel: 'whatsapp',
      title: 'WhatsApp test sent',
      body: text,
    });
    return res.json({ ok: true, to: sent.to, provider: 'wasender' });
  } catch (err) {
    return res.status(err.status && err.status < 600 ? err.status : 502).json({
      error: err.message || 'Failed to send WhatsApp message',
      details: err.details || null,
    });
  }
}
