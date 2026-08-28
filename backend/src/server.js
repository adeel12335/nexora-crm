import 'dotenv/config';
import { app } from './app.js';
import { startProductionDeadlineCron } from './jobs/productionDeadlineAlerts.js';
import { migrateAllBase64Uploads } from './controllers/uploads.controller.js';
import { ensureCardSortOrder } from './db/ensureSchema.js';

const port = process.env.PORT || 4000;

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
        })
        .catch((err) => console.error('[uploads] base64 migrate failed:', err.message));
    }
  });
}

start();
