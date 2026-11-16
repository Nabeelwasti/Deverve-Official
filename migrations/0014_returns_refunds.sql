-- Customer return requests and manually reconciled refunds.
CREATE TABLE IF NOT EXISTS return_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  return_number TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN ('wrong_item','damaged','size_issue','not_as_described','other')),
  details TEXT NOT NULL CHECK (length(details) BETWEEN 10 AND 1000),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','received','refunded')),
  refund_amount_paisa INTEGER NOT NULL CHECK (refund_amount_paisa >= 0),
  refund_method TEXT CHECK (refund_method IN ('bank_transfer','cash','store_credit')),
  refund_reference TEXT,
  admin_note TEXT NOT NULL DEFAULT '',
  reviewed_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  received_at TEXT,
  refunded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (status != 'refunded' OR (refund_method IS NOT NULL AND refund_reference IS NOT NULL AND length(refund_reference) >= 3))
);
CREATE INDEX IF NOT EXISTS idx_return_requests_status_created ON return_requests(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer_created ON return_requests(customer_id,created_at DESC);

CREATE TABLE IF NOT EXISTS return_request_items (
  id TEXT PRIMARY KEY,
  return_request_id TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_refund_paisa INTEGER NOT NULL CHECK (unit_refund_paisa >= 0),
  UNIQUE(return_request_id,order_item_id)
);
CREATE INDEX IF NOT EXISTS idx_return_request_items_request ON return_request_items(return_request_id);

CREATE TABLE IF NOT EXISTS return_status_events (
  id TEXT PRIMARY KEY,
  return_request_id TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('requested','approved','rejected','received','refunded')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer','admin','system')),
  actor_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_return_status_events_request ON return_status_events(return_request_id,created_at);
