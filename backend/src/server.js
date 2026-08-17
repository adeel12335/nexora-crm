import 'dotenv/config';
import { app } from './app.js';
import { startProductionDeadlineCron } from './jobs/productionDeadlineAlerts.js';
import { migrateAllBase64Uploads } from './controllers/uploads.controller.js';

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Nexora CRM backend listening on http://localhost:${port}`);
  startProductionDeadlineCron();

  // After Hostinger deploy: convert leftover base64 blobs in MySQL → /uploads
  if (String(process.env.MIGRATE_BASE64_ON_BOOT || 'true').toLowerCase() !== 'false') {
    const publicBase = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    migrateAllBase64Uploads({ publicBase })
      .then((r) => {
        if (r.filesConverted) {
          console.log(`[uploads] migrated ${r.filesConverted} base64 file(s) across ${r.cardsTouched} card(s)`);
        }
      })
      .catch((err) => console.error('[uploads] base64 migrate failed:', err.message));
  }
});
