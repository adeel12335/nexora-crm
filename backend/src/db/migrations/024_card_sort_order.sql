-- Manual board order (up/down drag). Duplicate-safe so Hostinger boot
-- ensure and `db:migrate` can both run without failing.
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_cards'
    AND COLUMN_NAME = 'sort_order'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE production_cards ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER stage',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE production_cards
SET sort_order = GREATEST(0, 2000000000 - UNIX_TIMESTAMP(COALESCE(updated_at, created_at))),
    updated_at = updated_at
WHERE sort_order = 0;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_cards'
    AND INDEX_NAME = 'idx_production_cards_stage_sort'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_production_cards_stage_sort ON production_cards (stage, sort_order)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
