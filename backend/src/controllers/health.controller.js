import { pool } from '../config/db.js';
import { getWasenderPublicConfig, isWasenderConfigured } from '../services/wasender.js';

const startedAt = Date.now();

/**
 * GET /health | GET /api/health
 * Public deploy probe — DB + env + WhatsApp config (no secrets leaked).
 */
export async function healthCheck(req, res) {
  const checks = {};
  let ok = true;

  // --- database ---
  const dbStarted = Date.now();
  try {
    const [rows] = await pool.query(
      'SELECT 1 AS ok, DATABASE() AS db_name, VERSION() AS version'
    );
    const row = rows[0] || {};
    checks.database = {
      ok: true,
      status: 'connected',
      name: row.db_name || process.env.DB_NAME || null,
      version: row.version || null,
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      latencyMs: Date.now() - dbStarted,
    };
  } catch (err) {
    ok = false;
    checks.database = {
      ok: false,
      status: 'disconnected',
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      name: process.env.DB_NAME || null,
      latencyMs: Date.now() - dbStarted,
      error: err.message,
    };
  }

  // --- env / auth config (booleans only) ---
  const jwtSet = Boolean(String(process.env.JWT_SECRET || '').trim())
    && process.env.JWT_SECRET !== 'change-this-in-production';
  checks.env = {
    ok: Boolean(String(process.env.JWT_SECRET || '').trim()),
    jwtSecretSet: Boolean(String(process.env.JWT_SECRET || '').trim()),
    jwtSecretIsDefault: !jwtSet && Boolean(String(process.env.JWT_SECRET || '').trim()),
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT) || 4000,
  };
  if (!checks.env.ok) ok = false;

  // --- WhatsApp / Wasender (config only; no live API call on every probe) ---
  const wa = getWasenderPublicConfig();
  checks.whatsapp = {
    ok: true,
    configured: isWasenderConfigured(),
    enabled: wa.enabled,
    sessionId: wa.sessionId,
  };

  // Optional deep check: ?deep=1 hits Wasender status (rate-limit aware)
  if (String(req.query.deep || '') === '1' && isWasenderConfigured()) {
    const waStarted = Date.now();
    try {
      const { getWasenderStatus } = await import('../services/wasender.js');
      const live = await getWasenderStatus();
      const statusValue =
        live?.status?.status ||
        live?.status?.data?.status ||
        live?.session?.status ||
        (typeof live?.status === 'string' ? live.status : null);
      checks.whatsapp.live = {
        ok: true,
        status: statusValue || 'unknown',
        latencyMs: Date.now() - waStarted,
      };
    } catch (err) {
      checks.whatsapp.live = {
        ok: false,
        error: err.message,
        latencyMs: Date.now() - waStarted,
      };
      // Don't fail overall health solely on WhatsApp live probe
    }
  }

  const payload = {
    ok,
    status: ok ? 'healthy' : 'unhealthy',
    service: 'nexora-crm-backend',
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    checks,
  };

  res.status(ok ? 200 : 503).json(payload);
}
