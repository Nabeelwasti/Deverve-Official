-- POS, shared stock controls and append-only cashbook foundation.
PRAGMA foreign_keys = ON;

ALTER TABLE product_variants ADD COLUMN barcode TEXT;
ALTER TABLE product_variants ADD COLUMN cost_price_paisa INTEGER NOT NULL DEFAULT 0 CHECK (cost_price_paisa >= 0);
ALTER TABLE product_variants ADD COLUMN reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode) WHERE barcode IS NOT NULL AND barcode <> '';

CREATE TABLE IF NOT EXISTS financial_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cash','bank','wallet','gateway')),
  masked_reference TEXT NOT NULL DEFAULT '',
  opening_balance_paisa INTEGER NOT NULL DEFAULT 0 CHECK (opening_balance_paisa >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_active ON financial_accounts(is_active,kind);

CREATE TABLE IF NOT EXISTS pos_registers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location_label TEXT NOT NULL DEFAULT 'Main shop',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS pos_sessions (
  id TEXT PRIMARY KEY,
  register_id TEXT NOT NULL REFERENCES pos_registers(id) ON DELETE RESTRICT,
  opened_by_admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  closed_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  opening_cash_paisa INTEGER NOT NULL CHECK (opening_cash_paisa >= 0),
  expected_cash_paisa INTEGER NOT NULL DEFAULT 0 CHECK (expected_cash_paisa >= 0),
  counted_cash_paisa INTEGER CHECK (counted_cash_paisa IS NULL OR counted_cash_paisa >= 0),
  variance_paisa INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_note TEXT NOT NULL DEFAULT '',
  closing_note TEXT NOT NULL DEFAULT '',
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_one_open_session ON pos_sessions(register_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_pos_sessions_opened ON pos_sessions(opened_at DESC,status);

CREATE TABLE IF NOT EXISTS pos_sales (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL REFERENCES pos_sessions(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL DEFAULT 'Walk-in customer',
  customer_phone TEXT NOT NULL DEFAULT '',
  subtotal_paisa INTEGER NOT NULL CHECK (subtotal_paisa >= 0),
  discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK (discount_paisa >= 0),
  total_paisa INTEGER NOT NULL CHECK (total_paisa >= 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided','refunded')),
  idempotency_key TEXT NOT NULL UNIQUE,
  cashier_admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  voided_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  void_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  voided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_created ON pos_sales(created_at DESC,status);
CREATE INDEX IF NOT EXISTS idx_pos_sales_session ON pos_sales(session_id,created_at DESC);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL DEFAULT '',
  size_snapshot TEXT NOT NULL DEFAULT '',
  color_snapshot TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paisa INTEGER NOT NULL CHECK (unit_price_paisa >= 0),
  unit_cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_paisa >= 0),
  line_total_paisa INTEGER NOT NULL CHECK (line_total_paisa >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON pos_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_variant ON pos_sale_items(variant_id);

CREATE TABLE IF NOT EXISTS pos_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','bank_transfer','mobile_wallet','card')),
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  tendered_paisa INTEGER NOT NULL CHECK (tendered_paisa >= amount_paisa),
  change_paisa INTEGER NOT NULL DEFAULT 0 CHECK (change_paisa >= 0),
  reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pos_payments_sale ON pos_payments(sale_id);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  category TEXT NOT NULL,
  reference_type TEXT NOT NULL DEFAULT 'manual',
  reference_id TEXT,
  register_session_id TEXT REFERENCES pos_sessions(id) ON DELETE RESTRICT,
  note TEXT NOT NULL DEFAULT '',
  actor_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  reverses_transaction_id TEXT REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_account_date ON financial_transactions(account_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_reference ON financial_transactions(reference_type,reference_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_session ON financial_transactions(register_session_id,created_at);

CREATE TABLE IF NOT EXISTS business_expenses (
  id TEXT PRIMARY KEY,
  expense_number TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  financial_transaction_id TEXT NOT NULL REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  register_session_id TEXT REFERENCES pos_sessions(id) ON DELETE RESTRICT,
  receipt_media_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  expense_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','voided')),
  created_by_admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  voided_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  void_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  voided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_business_expenses_date ON business_expenses(expense_date DESC,status);

INSERT OR IGNORE INTO financial_accounts (id,name,kind,masked_reference) VALUES
 ('cash-main','Main cash drawer','cash',''),
 ('bank-clearing','Bank transfer clearing','bank',''),
 ('wallet-clearing','Mobile wallet clearing','wallet',''),
 ('gateway-clearing','Online payment clearing','gateway','');
INSERT OR IGNORE INTO pos_registers (id,name,location_label) VALUES ('main-register','Main counter','Jhelum shop');

ALTER TABLE orders ADD COLUMN financial_account_id TEXT REFERENCES financial_accounts(id);
ALTER TABLE orders ADD COLUMN financial_transaction_id TEXT;

CREATE TRIGGER IF NOT EXISTS prevent_stock_below_reserved
BEFORE UPDATE OF stock_on_hand ON product_variants
WHEN NEW.stock_on_hand < NEW.reserved_quantity
BEGIN
  SELECT RAISE(ABORT, 'stock cannot be reduced below reserved quantity');
END;

CREATE TRIGGER IF NOT EXISTS pos_sale_item_stock_check
BEFORE INSERT ON pos_sale_items
WHEN (SELECT stock_on_hand - reserved_quantity FROM product_variants WHERE id = NEW.variant_id) < NEW.quantity
BEGIN
  SELECT RAISE(ABORT, 'insufficient available stock');
END;
