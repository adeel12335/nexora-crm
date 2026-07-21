-- Live portfolio: public URL + link to CRM client (agent ownership)
ALTER TABLE production_cards
  ADD COLUMN live_url VARCHAR(500) NULL AFTER description,
  ADD COLUMN client_id INT NULL AFTER client,
  ADD COLUMN priority_key VARCHAR(20) NOT NULL DEFAULT 'none' AFTER priority,
  ADD COLUMN extras_json JSON NULL AFTER live_url;

ALTER TABLE production_cards
  ADD CONSTRAINT fk_card_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
