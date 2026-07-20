-- Commission module.
--
-- Ported from the legacy `u290518193_lead` database, with three deliberate changes:
--   1. The legacy `scrapper` role is dropped (this schema never had it).
--   2. Commission rates are *snapshotted* onto the deal. The legacy schema
--      recalculated from the user's current rate, so editing someone's rate
--      silently rewrote historical payouts.
--   3. Production earns no commission — it is a cost that reduces profit.

-- ---------------------------------------------------------------------------
-- users: supervisor link + the user's own commission rate
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN manager_id INT NULL AFTER role,
  ADD COLUMN commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER manager_id;

ALTER TABLE users
  ADD CONSTRAINT fk_users_manager
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- What a manager earns on one specific agent under them.
-- Legacy equivalent: `agent_manager_commission`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manager_agent_commission (
  id INT AUTO_INCREMENT PRIMARY KEY,
  manager_id INT NOT NULL,
  agent_id INT NOT NULL,
  commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_manager_agent (manager_id, agent_id),
  CONSTRAINT fk_mac_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mac_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_mac_percentage CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  CONSTRAINT chk_mac_not_self CHECK (manager_id <> agent_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- deals — a closed client, the thing commission is earned on.
-- Legacy equivalent: `client_responses` (trimmed to the commission columns).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_name VARCHAR(160) NOT NULL,
  client_email VARCHAR(160) NULL,
  client_phone VARCHAR(40) NULL,
  agent_id INT NOT NULL,
  -- Snapshot of who the agent reported to when the deal was booked, so moving
  -- an agent to a new manager does not reassign old payouts.
  manager_id INT NULL,

  total_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  production_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  -- Rates frozen at booking time.
  agent_commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  manager_commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,

  -- Derived from total_paid on every payment; see utils/commission.js.
  agent_commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  manager_commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  profit DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  status ENUM('pending', 'closed', 'paid', 'cancelled') NOT NULL DEFAULT 'pending',
  commission_status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  commission_paid_at DATETIME NULL,
  notes TEXT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_deal_agent FOREIGN KEY (agent_id) REFERENCES users(id),
  CONSTRAINT fk_deal_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_deal_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_deal_cost CHECK (total_cost >= 0),
  CONSTRAINT chk_deal_paid CHECK (total_paid >= 0),
  CONSTRAINT chk_deal_production_cost CHECK (production_cost >= 0),
  CONSTRAINT chk_deal_agent_pct CHECK (agent_commission_percentage >= 0 AND agent_commission_percentage <= 100),
  CONSTRAINT chk_deal_manager_pct CHECK (manager_commission_percentage >= 0 AND manager_commission_percentage <= 100),
  INDEX idx_deal_agent (agent_id),
  INDEX idx_deal_manager (manager_id),
  INDEX idx_deal_status (status),
  INDEX idx_deal_commission_status (commission_status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- deal_payments — instalments received against a deal.
-- Legacy equivalent: `client_payments`. deals.total_paid is kept as the
-- running sum of these rows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deal_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deal_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  notes TEXT NULL,
  recorded_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_payment_amount CHECK (amount > 0),
  INDEX idx_payment_deal (deal_id),
  INDEX idx_payment_date (payment_date)
) ENGINE=InnoDB;
