-- Clients + partial payments + commission ledger (15th→15th cycle).
-- Production role never earns commission (enforced in app when writing entries).

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(40) NULL,
  agent_id INT NOT NULL,
  deal_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  notes VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_clients_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_clients_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_clients_agent (agent_id),
  INDEX idx_clients_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS client_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  notes VARCHAR(500) NULL,
  recorded_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_cp_amount CHECK (amount > 0),
  INDEX idx_cp_client (client_id),
  INDEX idx_cp_date (payment_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS commission_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  client_id INT NOT NULL,
  user_id INT NOT NULL,
  earner_role ENUM('agent', 'manager') NOT NULL,
  rate_percentage DECIMAL(5,2) NOT NULL,
  payment_amount DECIMAL(12,2) NOT NULL,
  commission_amount DECIMAL(12,2) NOT NULL,
  cycle_start DATE NOT NULL,
  cycle_end DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ce_payment FOREIGN KEY (payment_id) REFERENCES client_payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_ce_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_ce_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ce_user_cycle (user_id, cycle_start, cycle_end),
  INDEX idx_ce_cycle (cycle_start, cycle_end)
) ENGINE=InnoDB;
