-- Manager's cut on each agent, month by month.
--
-- Haseeb can earn 5% on Amir and 7% on Hamza. Those rates also change over
-- time, so they live in their own history table — the same inheritance rule
-- as user_commission_rates (greatest effective_month <= the month reported).

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
