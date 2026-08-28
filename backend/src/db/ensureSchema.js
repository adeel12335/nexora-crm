import { pool } from '../config/db.js';

/**
 * Hostinger deploys often skip `db:migrate`. Keep sort_order present so
 * list/move queries never 500, and backfill once if every row is still 0.
 */
export async function ensureCardSortOrder() {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'production_cards'
       AND COLUMN_NAME = 'sort_order'`,
  );
  if (!cols.length) {
    await pool.query(
      `ALTER TABLE production_cards
         ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER stage`,
    );
  }

  const [indexes] = await pool.query(
    `SHOW INDEX FROM production_cards WHERE Key_name = 'idx_production_cards_stage_sort'`,
  );
  if (!indexes.length) {
    await pool.query(
      `CREATE INDEX idx_production_cards_stage_sort ON production_cards (stage, sort_order)`,
    );
  }

  const [[stats]] = await pool.query(
    `SELECT
       SUM(CASE WHEN sort_order = 0 THEN 1 ELSE 0 END) AS zeros,
       COUNT(*) AS total
     FROM production_cards`,
  );
  const total = Number(stats?.total || 0);
  const zeros = Number(stats?.zeros || 0);
  if (!total || zeros < total) return;

  const [rows] = await pool.query(
    `SELECT id, stage FROM production_cards
     ORDER BY stage ASC, COALESCE(updated_at, created_at) DESC, id DESC`,
  );
  let stage = null;
  let n = 0;
  for (const row of rows) {
    if (row.stage !== stage) {
      stage = row.stage;
      n = 0;
    }
    await pool.query(
      'UPDATE production_cards SET sort_order = ?, updated_at = updated_at WHERE id = ?',
      [n * 10, row.id],
    );
    n += 1;
  }
}
