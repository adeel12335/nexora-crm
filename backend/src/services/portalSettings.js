import { pool } from '../config/db.js';

const DEFAULTS = {
  whatsapp_group_jid: '',
  whatsapp_notify_late_individuals: '1',
  whatsapp_notify_late_group: '1',
  whatsapp_notify_deadlines_group: '0',
  whatsapp_notify_card_updates_group: '1',
};

export async function getSetting(key, fallback = '') {
  const [[row]] = await pool.query(
    'SELECT setting_value FROM portal_settings WHERE setting_key = ?',
    [key]
  );
  if (!row) return fallback ?? DEFAULTS[key] ?? '';
  return row.setting_value ?? fallback ?? '';
}

export async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO portal_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value == null ? '' : String(value)]
  );
}

export async function getWhatsAppPortalSettings() {
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value FROM portal_settings
     WHERE setting_key LIKE 'whatsapp_%'`
  );
  const map = { ...DEFAULTS };
  for (const row of rows) map[row.setting_key] = row.setting_value ?? '';

  return {
    groupJid: String(map.whatsapp_group_jid || '').trim(),
    notifyLateIndividuals: map.whatsapp_notify_late_individuals !== '0',
    notifyLateGroup: map.whatsapp_notify_late_group !== '0',
    notifyDeadlinesGroup: map.whatsapp_notify_deadlines_group === '1',
    notifyCardUpdatesGroup: map.whatsapp_notify_card_updates_group !== '0',
  };
}

export async function saveWhatsAppPortalSettings(patch) {
  if (patch.groupJid !== undefined) {
    await setSetting('whatsapp_group_jid', String(patch.groupJid || '').trim());
  }
  if (patch.notifyLateIndividuals !== undefined) {
    await setSetting('whatsapp_notify_late_individuals', patch.notifyLateIndividuals ? '1' : '0');
  }
  if (patch.notifyLateGroup !== undefined) {
    await setSetting('whatsapp_notify_late_group', patch.notifyLateGroup ? '1' : '0');
  }
  if (patch.notifyDeadlinesGroup !== undefined) {
    await setSetting('whatsapp_notify_deadlines_group', patch.notifyDeadlinesGroup ? '1' : '0');
  }
  if (patch.notifyCardUpdatesGroup !== undefined) {
    await setSetting('whatsapp_notify_card_updates_group', patch.notifyCardUpdatesGroup ? '1' : '0');
  }
  return getWhatsAppPortalSettings();
}
