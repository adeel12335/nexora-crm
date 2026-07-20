-- Add Live stage between Review and Done on the production board.

ALTER TABLE production_cards
  MODIFY COLUMN stage ENUM(
    'new_draft',
    'in_progress',
    'revision',
    'review',
    'live',
    'done'
  ) NOT NULL DEFAULT 'new_draft';
