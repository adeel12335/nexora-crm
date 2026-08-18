-- Corrects 022. Adding the column stamped every existing row with the time of
-- the ALTER, so all cards looked equally "just updated" and board ordering had
-- nothing to sort by. There is no edit history for rows that predate the
-- column, so created_at is the best approximation of their last change.
--
-- Runs immediately after 022 on a fresh database, and only ever once.
UPDATE production_cards SET updated_at = created_at;
