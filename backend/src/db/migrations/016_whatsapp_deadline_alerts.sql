CREATE TABLE IF NOT EXISTS whatsapp_deadline_alerts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  card_id INT NOT NULL,
  alert_kind ENUM('due_1d', 'due_12h') NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_card_alert (card_id, alert_kind),
  KEY idx_alert_sent (sent_at),
  CONSTRAINT fk_wa_deadline_card
    FOREIGN KEY (card_id) REFERENCES production_cards (id)
    ON DELETE CASCADE
) ENGINE=InnoDB;
