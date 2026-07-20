-- Versioned commission cycle policies + one-off cycle overrides.
-- Ledger commission_entries.cycle_start/end remain immutable snapshots.

CREATE TABLE IF NOT EXISTS cycle_policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  anchor_day TINYINT UNSIGNED NOT NULL DEFAULT 15,
  end_day TINYINT UNSIGNED NOT NULL DEFAULT 14,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(500) NULL,
  CONSTRAINT fk_cycle_pol_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_cycle_pol_anchor CHECK (anchor_day BETWEEN 1 AND 28),
  CONSTRAINT chk_cycle_pol_end CHECK (end_day BETWEEN 1 AND 28),
  INDEX idx_cycle_pol_effective (effective_from, effective_to)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cycle_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_start DATE NOT NULL,
  cycle_end DATE NOT NULL,
  reason VARCHAR(500) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cycle_ov_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_cycle_ov_range CHECK (cycle_end >= cycle_start),
  UNIQUE KEY uq_cycle_ov_start (cycle_start),
  INDEX idx_cycle_ov_range (cycle_start, cycle_end)
) ENGINE=InnoDB;

-- Default historical rule: 15th → 14th of next month
INSERT INTO cycle_policies (anchor_day, end_day, effective_from, effective_to, notes)
SELECT 15, 14, '2000-01-01', NULL, 'Default 15→14 cycle'
WHERE NOT EXISTS (SELECT 1 FROM cycle_policies LIMIT 1);
