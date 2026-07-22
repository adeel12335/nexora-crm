INSERT INTO portal_settings (setting_key, setting_value) VALUES
  ('whatsapp_notify_card_updates_group', '1')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
