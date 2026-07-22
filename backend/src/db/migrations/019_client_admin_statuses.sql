-- Admin-only CRM statuses (sheet-style). Hidden from agent/manager APIs.
ALTER TABLE clients
  ADD COLUMN payment_status VARCHAR(40) NULL DEFAULT NULL
    COMMENT 'Admin CRM payment status' AFTER production_status,
  ADD COLUMN order_status VARCHAR(40) NULL DEFAULT NULL
    COMMENT 'Admin CRM order/workflow status' AFTER payment_status;

CREATE INDEX idx_clients_payment_status ON clients (payment_status);
CREATE INDEX idx_clients_order_status ON clients (order_status);
