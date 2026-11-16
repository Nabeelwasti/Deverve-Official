-- COD checkout: reserve stock while orders are pending, and make checkout submissions idempotent.
ALTER TABLE product_variants
  ADD COLUMN reserved_quantity INTEGER NOT NULL DEFAULT 0
  CHECK (reserved_quantity >= 0 AND reserved_quantity <= stock_on_hand);

ALTER TABLE orders ADD COLUMN checkout_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_token
  ON orders(checkout_token) WHERE checkout_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(order_status, created_at DESC);
