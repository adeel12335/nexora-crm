-- Repair production_cards.stage after 018 remapped values without expanding the ENUM.
-- Invalid ENUM values were truncated to '' in non-strict MySQL, breaking the board.

ALTER TABLE production_cards
  MODIFY COLUMN stage VARCHAR(64) NOT NULL DEFAULT 'new_project_create_draft';

UPDATE production_cards
SET stage = 'new_project_create_draft'
WHERE stage = '' OR stage IS NULL OR stage = 'new_draft';

UPDATE production_cards SET stage = 'page_expansion' WHERE stage = 'in_progress';
UPDATE production_cards SET stage = 'draft_revisions' WHERE stage = 'revision';
UPDATE production_cards SET stage = 'pending_approval' WHERE stage = 'review';
UPDATE production_cards SET stage = 'page_live' WHERE stage = 'live';
UPDATE production_cards SET stage = 'stopped_process' WHERE stage = 'done';

ALTER TABLE production_cards
  MODIFY COLUMN stage ENUM(
    'new_project_create_draft',
    'page_expansion',
    'draft_done',
    'draft_revisions',
    'pending_approval',
    'push_to_live',
    'page_live',
    'edits_after_publishing',
    'pages_to_relive',
    'stopped_process'
  ) NOT NULL DEFAULT 'new_project_create_draft';
