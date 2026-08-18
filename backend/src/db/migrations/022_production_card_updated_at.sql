-- Board ordering: surface the cards that moved most recently.
-- Backfilled from created_at, then maintained by MySQL on every UPDATE.
ALTER TABLE production_cards
  ADD COLUMN updated_at DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

UPDATE production_cards SET updated_at = created_at WHERE updated_at < created_at;

CREATE INDEX idx_production_cards_updated_at ON production_cards (updated_at);
