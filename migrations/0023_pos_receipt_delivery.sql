-- Customer-authorised delivery of POS receipts by email and WhatsApp.
-- Delivery is queued transactionally with the sale and retried by the Pages Worker.
ALTER TABLE pos_sales ADD COLUMN customer_email TEXT;
ALTER TABLE pos_sales ADD COLUMN email_receipt_consent INTEGER NOT NULL DEFAULT 0 CHECK (email_receipt_consent IN (0,1));
ALTER TABLE pos_sales ADD COLUMN whatsapp_receipt_consent INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_receipt_consent IN (0,1));

CREATE TABLE IF NOT EXISTS pos_receipt_outbox (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processing_started_at TEXT,
  provider_message_id TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at TEXT,
  UNIQUE(sale_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_pos_receipt_outbox_due
  ON pos_receipt_outbox(channel,status,next_attempt_at,created_at);
