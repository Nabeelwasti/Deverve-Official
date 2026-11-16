-- Preserve cost snapshots for online orders and make POS void/refund operations idempotent.
PRAGMA foreign_keys = ON;

ALTER TABLE order_items ADD COLUMN unit_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_paisa >= 0);

CREATE TABLE IF NOT EXISTS pos_sale_voids (
  sale_id TEXT PRIMARY KEY REFERENCES pos_sales(id) ON DELETE RESTRICT,
  voided_by_admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pos_sale_voids_created ON pos_sale_voids(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_transaction_reversal
ON financial_transactions(reverses_transaction_id)
WHERE reverses_transaction_id IS NOT NULL;

ALTER TABLE wholesale_quote_items ADD COLUMN unit_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_paisa >= 0);
