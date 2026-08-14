-- Follow-ups: personal reminders for agents & managers to reply to a client.
-- Free-text (no clients FK) so a reminder can be jotted for anyone. Each row is
-- owned by one user and only ever visible to that user.

CREATE TABLE IF NOT EXISTS follow_ups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  client_name VARCHAR(160) NOT NULL,
  note VARCHAR(500) NULL,
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  status ENUM('pending', 'done') NOT NULL DEFAULT 'pending',
  done_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_followup_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_followup_user_status (user_id, status),
  INDEX idx_followup_priority (priority)
) ENGINE=InnoDB;
