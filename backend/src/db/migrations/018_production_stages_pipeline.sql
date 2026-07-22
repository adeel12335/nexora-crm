-- Remap production card stages to Wiki Studio pipeline statuses.
UPDATE production_cards SET stage = 'new_project_create_draft' WHERE stage = 'new_draft';
UPDATE production_cards SET stage = 'page_expansion' WHERE stage = 'in_progress';
UPDATE production_cards SET stage = 'draft_revisions' WHERE stage = 'revision';
UPDATE production_cards SET stage = 'pending_approval' WHERE stage = 'review';
UPDATE production_cards SET stage = 'page_live' WHERE stage = 'live';
UPDATE production_cards SET stage = 'stopped_process' WHERE stage = 'done';
