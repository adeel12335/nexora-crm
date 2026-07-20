-- Attendance checkout progress + worked duration.
-- work_date stays the Karachi calendar day; check-in/out stored as UTC DATETIME.

ALTER TABLE attendance_records
  ADD COLUMN emails_sent INT NULL AFTER status,
  ADD COLUMN worked_minutes INT NULL AFTER emails_sent;

CREATE TABLE IF NOT EXISTS daily_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  work_date DATE NOT NULL,
  emails_sent INT NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_progress_user_day (user_id, work_date),
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
