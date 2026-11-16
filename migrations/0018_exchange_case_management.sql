-- Dedicated exchange case management. Legacy return/refund records remain read-only history.
CREATE TABLE IF NOT EXISTS exchange_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  exchange_number TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN ('wrong_item','damaged','size_issue','other')),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','reviewing','approved','rejected','item_received','completed')),
  admin_note TEXT NOT NULL DEFAULT '',
  reviewed_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  received_at TEXT,
  completed_at TEXT,
  UNIQUE(order_id)
);

CREATE TABLE IF NOT EXISTS exchange_request_items (
  id TEXT PRIMARY KEY,
  exchange_request_id TEXT NOT NULL REFERENCES exchange_requests(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 100),
  requested_size TEXT NOT NULL DEFAULT '',
  requested_color TEXT NOT NULL DEFAULT '',
  UNIQUE(exchange_request_id, order_item_id)
);

CREATE TABLE IF NOT EXISTS exchange_status_events (
  id TEXT PRIMARY KEY,
  exchange_request_id TEXT NOT NULL REFERENCES exchange_requests(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('requested','reviewing','approved','rejected','item_received','completed')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer','admin','system')),
  actor_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_exchange_requests_customer_created ON exchange_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_status_created ON exchange_requests(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_exchange_items_request ON exchange_request_items(exchange_request_id);
CREATE INDEX IF NOT EXISTS idx_exchange_events_request_created ON exchange_status_events(exchange_request_id, created_at ASC);
