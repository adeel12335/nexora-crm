import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { pool } from '../src/config/db.js';
import { ensureDataCenterLeads } from '../src/db/ensureSchema.js';
import {
  insertUniqueLeads,
  rowsFromCsvText,
  uniqueLeads,
} from '../src/services/dataCenter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveCsvPath() {
  const arg = process.argv[2];
  if (arg) return path.resolve(arg);
  const temp = path.join(process.env.TEMP || '/tmp', 'wiki-sheet.csv');
  const bundled = path.join(__dirname, 'data', 'wiki-leads.csv');
  if (fs.existsSync(temp)) return temp;
  if (fs.existsSync(bundled)) return bundled;
  return temp;
}

async function main() {
  const csvPath = resolveCsvPath();
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  await ensureDataCenterLeads();

  const text = fs.readFileSync(csvPath, 'utf8');
  const rawRows = rowsFromCsvText(text);
  const { leads, skippedInvalid, skippedDuplicate } = uniqueLeads(
    rawRows.map((row) => ({ ...row, source: 'sheet-import' })),
  );

  console.log(`File: ${csvPath}`);
  console.log(`Rows: ${rawRows.length}`);
  console.log(`Unique emails: ${leads.length}`);
  console.log(`Skipped invalid: ${skippedInvalid}`);
  console.log(`Skipped in-file duplicates: ${skippedDuplicate}`);

  const inserted = await insertUniqueLeads(pool, leads);
  console.log(`Inserted: ${inserted}`);
  console.log(`Already in DB: ${Math.max(0, leads.length - inserted)}`);

  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT NULLIF(university, '')) AS universities,
            COUNT(DISTINCT NULLIF(country, '')) AS countries
     FROM data_center_leads`,
  );
  console.log(
    `Table now: ${summary.total} leads · ${summary.universities} universities · ${summary.countries} countries`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error('Import failed:', err.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
