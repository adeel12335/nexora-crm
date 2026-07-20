CREATE TABLE IF NOT EXISTS portal_settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO portal_settings (setting_key, setting_value) VALUES
  ('whatsapp_group_jid', ''),
  ('whatsapp_notify_late_individuals', '1'),
  ('whatsapp_notify_late_group', '1'),
  ('whatsapp_notify_deadlines_group', '0')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
