import mysql from 'mysql2/promise';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const DB_NAME = process.env.DB_NAME || 'nexora_crm';

function pendingFirst(a, b) {
  return a.localeCompare(b, 'en', { numeric: true });
}

async function migrate() {
  // Connect without a database first — 001 creates it.
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.changeUser({ database: DB_NAME });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  const [applied] = await connection.query('SELECT version FROM schema_migrations');
  const done = new Set(applied.map((row) => row.version));

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort(pendingFirst);
  const pending = files.filter((f) => !done.has(f));

  if (pending.length === 0) {
    console.log(`Database "${DB_NAME}" is up to date (${files.length} migrations applied).`);
    await connection.end();
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  applying ${file} ... `);
    try {
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      console.log('ok');
    } catch (err) {
      console.log('FAILED');
      throw new Error(`${file}: ${err.message}`);
    }
  }

  console.log(`Applied ${pending.length} migration(s) to "${DB_NAME}".`);
  await connection.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
