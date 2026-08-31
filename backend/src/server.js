import 'dotenv/config';
import { app } from './app.js';
import { startProductionDeadlineCron } from './jobs/productionDeadlineAlerts.js';
import { migrateAllBase64Uploads, migrateNormalizedAttachmentUrls } from './controllers/uploads.controller.js';
import { ensureCardSortOrder } from './db/ensureSchema.js';

const port = process.env.PORT || 4000;

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error('[unhandledRejection]', message);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err.message);
  process.exit(1);
});

async function start() {
  try {
    await ensureCardSortOrder();
  } catch (err) {
    console.error('[schema] sort_order ensure failed:', err.message);
  }

  app.listen(port, () => {
    console.log(`Nexora CRM backend listening on http://localhost:${port}`);
    startProductionDeadlineCron();

    // After Hostinger deploy: convert leftover base64 blobs in MySQL → /uploads
    if (String(process.env.MIGRATE_BASE64_ON_BOOT || 'true').toLowerCase() !== 'false') {
      migrateAllBase64Uploads()
        .then((r) => {
          if (r.filesConverted) {
            console.log(`[uploads] migrated ${r.filesConverted} base64 file(s) across ${r.cardsTouched} card(s)`);
          }
          return migrateNormalizedAttachmentUrls();
        })
        .then((r) => {
          if (r?.cardsTouched) {
            console.log(`[uploads] normalized attachment URLs on ${r.cardsTouched} card(s)`);
          }
        })
        .catch((err) => console.error('[uploads] attachment migrate failed:', err.message));
    }
  });
}

start().catch((err) => {
  console.error('[boot] failed:', err.stack || err.message);
  process.exit(1);
});
