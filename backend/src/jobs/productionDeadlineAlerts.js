import cron from 'node-cron';
import { pool } from '../config/db.js';
import { classifyDeadlineAlertKind } from '../utils/deadlineUtils.js';
import { notifyDeadline } from '../services/notifications.js';
import { isWasenderConfigured } from '../services/wasender.js';

const ALERT_COPY = {
  due_1d: {
    title: '1 day left',
    lead: '1 day left',
  },
  due_12h: {
    title: '12 hours left',
    lead: '12 hours left',
  },
};

function cronEnabled() {
  return String(process.env.CRON_ENABLED || 'true').toLowerCase() !== 'false';
}

export async function runProductionDeadlineAlerts(now = new Date()) {
  const [rows] = await pool.query(
    `SELECT
       pc.id,
       pc.title,
       pc.client,
       pc.due_date,
       pc.stage,
       pc.assignee_id,
       u.name AS assignee_name,
       u.whatsapp_number AS assignee_whatsapp
     FROM production_cards pc
     JOIN users u ON u.id = pc.assignee_id
     WHERE pc.stage NOT IN ('live', 'done')
       AND pc.due_date IS NOT NULL`
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const card of rows) {
    const kind = classifyDeadlineAlertKind(card.due_date, now);
    if (!kind) {
      skipped += 1;
      continue;
    }

    try {
      const [insertResult] = await pool.query(
        `INSERT IGNORE INTO whatsapp_deadline_alerts (card_id, alert_kind)
         VALUES (?, ?)`,
        [card.id, kind]
      );
      if (!insertResult.affectedRows) {
        skipped += 1;
        continue;
      }

      const copy = ALERT_COPY[kind];
      const assigneeName = card.assignee_name || 'Unassigned';
      const body = `${copy.lead}: "${card.title}" for ${card.client} — assignee ${assigneeName}`;

      await notifyDeadline({
        userId: card.assignee_id,
        whatsappNumber: card.assignee_whatsapp,
        title: copy.title,
        body,
        relatedCardId: card.id,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[deadline-cron] card ${card.id} (${kind}):`, err.message);
      try {
        await pool.query(
          'DELETE FROM whatsapp_deadline_alerts WHERE card_id = ? AND alert_kind = ?',
          [card.id, kind]
        );
      } catch {
        // ignore rollback failure
      }
    }
  }

  return { scanned: rows.length, sent, skipped, failed };
}

export function startProductionDeadlineCron() {
  if (!cronEnabled()) {
    console.log('[deadline-cron] skipped (CRON_ENABLED=false)');
    return null;
  }
  if (!isWasenderConfigured()) {
    console.log('[deadline-cron] started, but Wasender is not configured — alerts will be in-app only until API key is set');
  }

  const task = cron.schedule(
    '*/15 * * * *',
    async () => {
      try {
        const result = await runProductionDeadlineAlerts();
        if (result.sent || result.failed) {
          console.log(
            `[deadline-cron] scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`
          );
        }
      } catch (err) {
        console.error('[deadline-cron] run failed:', err.message);
      }
    },
    { timezone: 'Asia/Karachi' }
  );

  console.log('[deadline-cron] scheduled every 15 minutes (Asia/Karachi)');
  return task;
}
