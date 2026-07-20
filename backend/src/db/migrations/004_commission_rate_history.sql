-- Month-wise commission rate history.
--
-- Rates change month to month. A single current-rate column meant that raising
-- someone from 5% to 10% in May silently rewrote April's figures too. Rates are
-- therefore stored per month and reports resolve the rate that was in force for
-- the month being reported.
--
-- Resolution rule: for month M, take the row with the greatest effective_month
-- that is <= M. A month with no row of its own inherits the last one set.
--
--   Apr 2026  15%   <- set in April,  applies to Apr and May
--   Jun 2026  10%   <- set in June,   applies to Jun onward
--
-- effective_month is always the first of the month (YYYY-MM-01).

-- ---------------------------------------------------------------------------
-- What a person earns on their own work, by month.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_commission_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  effective_month DATE NOT NULL,
  commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_month (user_id, effective_month),
  CONSTRAINT fk_ucr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ucr_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_ucr_percentage CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  INDEX idx_ucr_lookup (user_id, effective_month)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- What a manager earns on one specific agent, by month.
-- Replaces manager_agent_commission, which held only a current value.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manager_agent_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  manager_id INT NOT NULL,
  agent_id INT NOT NULL,
  effective_month DATE NOT NULL,
  commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_manager_agent_month (manager_id, agent_id, effective_month),
  CONSTRAINT fk_mar_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mar_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mar_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_mar_percentage CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  CONSTRAINT chk_mar_not_self CHECK (manager_id <> agent_id),
  INDEX idx_mar_lookup (manager_id, agent_id, effective_month)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Carry the existing single rates over as each person's opening rate, backdated
-- to the month they joined so historical months resolve to something.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO user_commission_rates (user_id, effective_month, commission_percentage)
SELECT id, DATE_FORMAT(created_at, '%Y-%m-01'), commission_percentage
FROM users
WHERE commission_percentage > 0;

INSERT IGNORE INTO manager_agent_rates (manager_id, agent_id, effective_month, commission_percentage)
SELECT mac.manager_id, mac.agent_id, DATE_FORMAT(mac.created_at, '%Y-%m-01'), mac.commission_percentage
FROM manager_agent_commission mac;

-- The history tables are now the single source of truth.
DROP TABLE IF EXISTS manager_agent_commission;

ALTER TABLE users DROP COLUMN commission_percentage;
