-- Multiple check-in/out sessions per day. Day row stays 1:1 for late/off status.

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  work_date DATE NOT NULL,
  check_in_time DATETIME NOT NULL,
  check_out_time DATETIME NULL,
  emails_sent INT NULL,
  worked_minutes INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sess_user_day (user_id, work_date),
  INDEX idx_sess_open (user_id, check_out_time),
  CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Backfill one session per existing day that had a check-in
INSERT INTO attendance_sessions (user_id, work_date, check_in_time, check_out_time, emails_sent, worked_minutes)
SELECT user_id, work_date, check_in_time, check_out_time, emails_sent, worked_minutes
FROM attendance_records
WHERE check_in_time IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM attendance_sessions s
    WHERE s.user_id = attendance_records.user_id
      AND s.work_date = attendance_records.work_date
      AND s.check_in_time = attendance_records.check_in_time
  );
