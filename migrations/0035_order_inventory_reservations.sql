-- First-class reservation ledger: one durable row per order and variant.
-- No automatic expiry is applied: payment-provider callbacks may arrive late.
CREATE TABLE IF NOT EXISTS order_inventory_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','released','consumed')),
  payment_provider TEXT NOT NULL DEFAULT 'manual',
  payment_reference TEXT,
  reserved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  released_at TEXT,
  consumed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(order_id, variant_id),
  CHECK ((status = 'reserved' AND released_at IS NULL AND consumed_at IS NULL)
      OR (status = 'released' AND released_at IS NOT NULL AND consumed_at IS NULL)
      OR (status = 'consumed' AND consumed_at IS NOT NULL AND released_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_order_inventory_reservations_order_status
ON order_inventory_reservations(order_id, status);

CREATE INDEX IF NOT EXISTS idx_order_inventory_reservations_variant_status
ON order_inventory_reservations(variant_id, status);
