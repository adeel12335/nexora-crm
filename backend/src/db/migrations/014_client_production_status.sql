-- Track whether a CRM client has been pushed to the production board.

ALTER TABLE clients
  ADD COLUMN production_status ENUM('pending', 'in_production', 'done')
    NOT NULL DEFAULT 'pending'
    AFTER is_active;

CREATE INDEX idx_clients_production_status ON clients (production_status);
