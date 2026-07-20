CREATE DATABASE IF NOT EXISTS nexora_crm
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE nexora_crm;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'manager', 'agent', 'production') NOT NULL,
  avatar_url VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  work_date DATE NOT NULL,
  check_in_time DATETIME NULL,
  check_out_time DATETIME NULL,
  status ENUM('present', 'late', 'absent', 'off') NOT NULL DEFAULT 'present',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_day (user_id, work_date),
  CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS production_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  client VARCHAR(160) NOT NULL,
  type ENUM('draft', 'revision') NOT NULL,
  stage ENUM('new_draft', 'in_progress', 'revision', 'review', 'done') NOT NULL DEFAULT 'new_draft',
  assignee_id INT NOT NULL,
  priority TINYINT(1) NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  attachments_count INT NOT NULL DEFAULT 0,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date DATETIME NOT NULL,
  CONSTRAINT fk_card_assignee FOREIGN KEY (assignee_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS production_card_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  card_id INT NOT NULL,
  author_id INT NULL,
  text TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_card FOREIGN KEY (card_id) REFERENCES production_cards(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  type ENUM('deadline', 'attendance', 'system') NOT NULL,
  tone ENUM('red', 'orange', 'green', 'blue') NOT NULL DEFAULT 'blue',
  icon VARCHAR(40) NOT NULL DEFAULT 'i-bell',
  channel ENUM('app', 'whatsapp', 'email') NOT NULL DEFAULT 'app',
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  related_card_id INT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_card FOREIGN KEY (related_card_id) REFERENCES production_cards(id) ON DELETE SET NULL
) ENGINE=InnoDB;
