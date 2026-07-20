-- User module: contact details, mailboxes, and a cleanup of the deals tables.
--
-- Deals/payments were built ahead of their turn and are removed here. What the
-- commission model actually needs at this stage lives on users
-- (commission_percentage) and manager_agent_commission (the manager's cut per
-- agent) — both introduced in 002 and kept.

DROP TABLE IF EXISTS deal_payments;
DROP TABLE IF EXISTS deals;

-- ---------------------------------------------------------------------------
-- users: contact details. whatsapp_number is stored in E.164 (+923001234567)
-- so the alerting integration can use it verbatim; the API normalises local
-- Pakistani input (03001234567) before it reaches this column.
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN phone VARCHAR(20) NULL AFTER email,
  ADD COLUMN whatsapp_number VARCHAR(20) NULL AFTER phone,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER commission_percentage,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- mailboxes — the sending addresses an agent or manager works out of.
-- Legacy equivalent: `email_boxes`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mailboxes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  email_address VARCHAR(190) NOT NULL,
  label VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- The same address must not be registered twice for one person. Two people
  -- may legitimately share a shared inbox, so this is not globally unique.
  UNIQUE KEY uniq_user_mailbox (user_id, email_address),
  CONSTRAINT fk_mailbox_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_mailbox_user (user_id)
) ENGINE=InnoDB;
