-- Owner-facing operational notifications. Payloads contain business references, not customer secrets.
CREATE TABLE IF NOT EXISTS owner_notifications (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('order.created','rental.created','enquiry.created','payment.succeeded')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 500),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order','rental_request','enquiry')),
  entity_id TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_owner_notifications_unread_created ON owner_notifications(is_read,created_at DESC);
