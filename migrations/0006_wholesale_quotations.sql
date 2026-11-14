-- Wholesale quotation workflow: itemised quotes, customer approval links and COD conversion.
ALTER TABLE wholesale_quotes ADD COLUMN delivery_address TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesale_quotes ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesale_quotes ADD COLUMN customer_note TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesale_quotes ADD COLUMN approval_token TEXT;
ALTER TABLE wholesale_quotes ADD COLUMN converted_order_id TEXT REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE wholesale_quotes ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_wholesale_quotes_approval_token
  ON wholesale_quotes(approval_token) WHERE approval_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wholesale_quotes_converted_order
  ON wholesale_quotes(converted_order_id) WHERE converted_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wholesale_quotes_status_created
  ON wholesale_quotes(status, created_at DESC);

CREATE TABLE IF NOT EXISTS wholesale_quote_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES wholesale_quotes(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot TEXT,
  size_snapshot TEXT NOT NULL DEFAULT '',
  color_snapshot TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paisa INTEGER NOT NULL CHECK (unit_price_paisa >= 0),
  line_total_paisa INTEGER NOT NULL CHECK (line_total_paisa >= 0)
);
CREATE INDEX IF NOT EXISTS idx_wholesale_quote_items_quote
  ON wholesale_quote_items(quote_id);
ALTER TABLE orders ADD COLUMN source_quote_id TEXT REFERENCES wholesale_quotes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_source_quote
  ON orders(source_quote_id) WHERE source_quote_id IS NOT NULL;
