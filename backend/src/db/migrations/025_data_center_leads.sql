-- Unique outreach leads for the admin Data Center.
-- Email is the uniqueness key (stored lowercase).

CREATE TABLE IF NOT EXISTS data_center_leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(190) NOT NULL,
  university VARCHAR(160) NULL,
  country VARCHAR(80) NULL,
  email_domain VARCHAR(160) NULL,
  status VARCHAR(80) NULL,
  notes VARCHAR(255) NULL,
  source VARCHAR(80) NULL DEFAULT 'import',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_data_center_email (email),
  KEY idx_data_center_university (university),
  KEY idx_data_center_country (country),
  KEY idx_data_center_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
