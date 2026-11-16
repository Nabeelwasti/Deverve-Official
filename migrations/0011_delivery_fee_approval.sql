-- Customer-approved final COD delivery fee workflow.
-- Existing orders remain dispatchable; new retail checkout orders start awaiting a delivery quote.
ALTER TABLE orders ADD COLUMN delivery_fee_status TEXT NOT NULL DEFAULT 'accepted'
  CHECK (delivery_fee_status IN ('pending_quote','awaiting_customer','accepted','declined'));
ALTER TABLE orders ADD COLUMN delivery_fee_token_hash TEXT;
ALTER TABLE orders ADD COLUMN delivery_fee_expires_at TEXT;
ALTER TABLE orders ADD COLUMN delivery_fee_quote_sent_at TEXT;
ALTER TABLE orders ADD COLUMN delivery_fee_accepted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_delivery_fee_status ON orders(delivery_fee_status, delivery_fee_expires_at);
