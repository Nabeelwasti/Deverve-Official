-- Customer identity, payment reconciliation, order history and notification foundations.
-- Additive only: existing orders and rental requests remain intact. Secrets never belong in D1.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email_verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_customers_status_created ON customers(status,created_at DESC);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS customer_account_tokens (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','password_reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_account_tokens_expiry ON customer_account_tokens(expires_at,purpose);

ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE rental_requests ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rentals_customer_created ON rental_requests(customer_id,created_at DESC);

CREATE TABLE IF NOT EXISTS order_status_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('pending','confirmed','processing','dispatched','delivered','cancelled')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','admin','customer','payment_provider')),
  actor_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_order_status_events_order ON order_status_events(order_id,created_at);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('safepay','manual')),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','production')),
  provider_reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  currency TEXT NOT NULL DEFAULT 'PKR' CHECK (currency = 'PKR'),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','succeeded','failed','cancelled','refunded')),
  checkout_url TEXT,
  failure_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(provider,provider_reference)
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id,created_at DESC);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received','processed','ignored','failed')),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processed_at TEXT,
  UNIQUE(provider,provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_status ON payment_webhook_events(processing_status,received_at);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  rental_request_id TEXT REFERENCES rental_requests(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  template_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_error_code TEXT,
  provider_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at TEXT,
  CHECK (customer_id IS NOT NULL OR order_id IS NOT NULL OR rental_request_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_due ON notification_outbox(status,next_attempt_at);

CREATE TABLE IF NOT EXISTS notification_attempts (
  id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted','rejected','error')),
  provider_message_id TEXT,
  error_code TEXT,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notification_attempts_outbox ON notification_attempts(outbox_id,attempted_at DESC);
