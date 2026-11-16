-- Extend the owner notification taxonomy for the exchange case workflow.
-- Preserve existing notifications while widening the accepted event/entity types.
CREATE TABLE owner_notifications_v2 (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('order.created','rental.created','enquiry.created','payment.succeeded','exchange.created')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 500),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order','rental_request','enquiry','exchange_request')),
  entity_id TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  read_at TEXT
);

INSERT INTO owner_notifications_v2 (id,event_type,title,body,entity_type,entity_id,is_read,created_at,read_at)
SELECT id,event_type,title,body,entity_type,entity_id,is_read,created_at,read_at FROM owner_notifications;

DROP TABLE owner_notifications;
ALTER TABLE owner_notifications_v2 RENAME TO owner_notifications;
CREATE INDEX idx_owner_notifications_unread_created ON owner_notifications(is_read,created_at DESC);
