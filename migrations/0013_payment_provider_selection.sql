-- Explicitly separate the order's payment rail from the legacy COD-only payment_method field.
-- The original payment_method CHECK constraint intentionally remains unchanged for compatibility.
ALTER TABLE orders ADD COLUMN payment_provider TEXT NOT NULL DEFAULT 'manual'
  CHECK (payment_provider IN ('manual','safepay'));
CREATE INDEX IF NOT EXISTS idx_orders_payment_provider_status
  ON orders(payment_provider,payment_status,created_at DESC);
