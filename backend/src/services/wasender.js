/**
 * WasenderAPI client — session-scoped WhatsApp messaging (DM + groups).
 */

const DEFAULT_BASE = 'https://www.wasenderapi.com';

function config() {
  const apiKey = String(process.env.WASENDER_API_KEY || '').trim();
  const baseUrl = String(process.env.WASENDER_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const sessionId = String(process.env.WASENDER_SESSION_ID || '').trim();
  const enabled = String(process.env.WASENDER_ENABLED || 'true').toLowerCase() !== 'false';
  return { apiKey, baseUrl, sessionId, enabled };
}

export function isWasenderConfigured() {
  const { apiKey, enabled } = config();
  return Boolean(enabled && apiKey);
}

export function getWasenderPublicConfig() {
  const { baseUrl, sessionId, enabled, apiKey } = config();
  return {
    enabled,
    configured: Boolean(apiKey),
    baseUrl,
    sessionId: sessionId || null,
    manageUrl: sessionId ? `https://wasenderapi.com/whatsapp/manage/${sessionId}` : null,
  };
}

/** Group JID like 1203630…@g.us */
export function isGroupJid(value) {
  const v = String(value || '').trim().toLowerCase();
  return v.includes('@g.us') || v.includes('@newsletter');
}

/** Phone E.164 / local → digits, or pass through group JID. */
export function toWasenderRecipient(to) {
  const raw = String(to || '').trim();
  if (!raw) return null;
  if (isGroupJid(raw)) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

async function wasenderFetch(path, { method = 'GET', body } = {}) {
  const { apiKey, baseUrl, enabled } = config();
  if (!enabled) {
    const err = new Error('WhatsApp sending is disabled (WASENDER_ENABLED=false)');
    err.status = 503;
    throw err;
  }
  if (!apiKey) {
    const err = new Error('WASENDER_API_KEY is not set — paste the session API key from Wasender dashboard');
    err.status = 503;
    throw err;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.errors?.[0]?.message ||
      `Wasender API error (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return data;
}

/**
 * Send text to a phone number or WhatsApp group JID.
 */
export async function sendWhatsAppText(toRaw, text) {
  const to = toWasenderRecipient(toRaw);
  if (!to) {
    const err = new Error('Invalid WhatsApp recipient (use a phone number or group JID like …@g.us)');
    err.status = 400;
    throw err;
  }
  const message = String(text || '').trim();
  if (!message) {
    const err = new Error('Message text is required');
    err.status = 400;
    throw err;
  }
  if (message.length > 4096) {
    const err = new Error('Message is too long (max 4096 characters)');
    err.status = 400;
    throw err;
  }

  const data = await wasenderFetch('/api/send-message', {
    method: 'POST',
    body: { to, text: message },
  });

  return {
    ok: true,
    to,
    isGroup: isGroupJid(to),
    provider: 'wasender',
    response: data,
  };
}

export async function listWasenderGroups() {
  const data = await wasenderFetch('/api/groups');
  const list = Array.isArray(data) ? data : (data?.data || data?.groups || []);
  return (list || []).map((g) => ({
    id: g.id || g.jid || g.groupJid || g.group_id || null,
    name: g.name || g.subject || g.notify || 'Unnamed group',
    raw: g,
  })).filter((g) => g.id);
}

export async function getWasenderStatus() {
  const { sessionId } = config();
  const status = await wasenderFetch('/api/status');
  let session = null;
  if (sessionId) {
    try {
      session = await wasenderFetch(`/api/whatsapp-sessions/${sessionId}`);
    } catch {
      session = null;
    }
  }
  return { status, session, ...getWasenderPublicConfig() };
}
