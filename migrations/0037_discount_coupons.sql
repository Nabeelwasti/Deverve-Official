-- Controlled, auditable discount vouchers. Coupon codes are stored as SHA-256 hashes;
-- plaintext codes are shown only at creation time and are never persisted.
CREATE TABLE IF NOT EXISTS discount_coupons (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  code_prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('exchange_compensation','damaged_item','wrong_item','size_exchange','goodwill','first_order','loyalty','campaign','wholesale','manual_adjustment')),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','fixed','free_delivery')),
  discount_value INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0 AND (discount_type != 'percent' OR discount_value <= 10000) AND (discount_type != 'free_delivery' OR discount_value = 0)),
  max_discount_paisa INTEGER CHECK (max_discount_paisa IS NULL OR max_discount_paisa >= 0),
  min_subtotal_paisa INTEGER NOT NULL DEFAULT 0 CHECK (min_subtotal_paisa >= 0),
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  exchange_request_id TEXT REFERENCES exchange_requests(id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_customer_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  CHECK (purpose NOT IN ('exchange_compensation','damaged_item','wrong_item','size_exchange') OR (customer_id IS NOT NULL AND exchange_request_id IS NOT NULL AND COALESCE(max_redemptions,0) = 1 AND per_customer_limit = 1))
);

CREATE TABLE IF NOT EXISTS discount_coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES discount_coupons(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  exchange_request_id TEXT REFERENCES exchange_requests(id) ON DELETE RESTRICT,
  discount_amount_paisa INTEGER NOT NULL CHECK (discount_amount_paisa >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(coupon_id, customer_id, order_id),
  UNIQUE(exchange_request_id)
);

CREATE INDEX IF NOT EXISTS idx_discount_coupons_active_window ON discount_coupons(is_active, starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_discount_coupons_customer ON discount_coupons(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_customer ON discount_coupon_redemptions(coupon_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_exchange ON discount_coupon_redemptions(exchange_request_id);
