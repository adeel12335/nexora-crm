-- Payment method recorded on each client payment (also shown on invoices).

ALTER TABLE client_payments
  ADD COLUMN payment_method VARCHAR(40) NULL DEFAULT NULL
    AFTER payment_date;

CREATE INDEX idx_cp_method ON client_payments (payment_method);
