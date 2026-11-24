-- Emergency offline POS: device identity, short-lived permits, reserved stock and immutable sync evidence.
-- This migration is additive. It does not enable offline checkout or alter existing sales.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pos_offline_devices (
  id TEXT PRIMARY KEY,
  register_id TEXT NOT NULL REFERENCES pos_registers(id) ON DELETE RESTRICT,
  enrolled_by_admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  device_label TEXT NOT NULL CHECK (length(device_label) BETWEEN 2 AND 100),
  public_key_jwk_json TEXT NOT NULL CHECK (length(public_key_jwk_json) BETWEEN 20 AND 2048),
  public_key_thumbprint TEXT NOT NULL UNIQUE CHECK (length(public_key_thumbprint) BETWEEN 20 AND 128),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT,
  revoked_at TEXT,
  revoked_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  CHECK ((status = 'revoked' AND revoked_at IS NOT NULL) OR status <> 'revoked')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_offline_one_active_device_per_register
  ON pos_offline_devices(register_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pos_offline_devices_status
  ON pos_offline_devices(status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS pos_offline_permits (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES pos_offline_devices(id) ON DELETE RESTRICT,
  register_id TEXT NOT NULL REFERENCES pos_registers(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL REFERENCES pos_sessions(id) ON DELETE RESTRICT,
  cashier_admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  cashier_grant_version TEXT NOT NULL DEFAULT '',
  snapshot_version TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL CHECK (length(snapshot_hash) BETWEEN 32 AND 128),
  claims_json TEXT NOT NULL CHECK (length(claims_json) BETWEEN 2 AND 16384),
  signature_base64url TEXT NOT NULL CHECK (length(signature_base64url) BETWEEN 40 AND 512),
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  max_events INTEGER NOT NULL DEFAULT 20 CHECK (max_events BETWEEN 1 AND 20),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked','consumed')),
  revoked_at TEXT,
  revoked_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (expires_at > issued_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_offline_one_active_per_device
  ON pos_offline_permits(device_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pos_offline_permits_expiry
  ON pos_offline_permits(status, expires_at);

CREATE TABLE IF NOT EXISTS pos_offline_stock_allocations (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES pos_offline_devices(id) ON DELETE RESTRICT,
  register_id TEXT NOT NULL REFERENCES pos_registers(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  allocated_quantity INTEGER NOT NULL CHECK (allocated_quantity BETWEEN 1 AND 20),
  consumed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
  released_quantity INTEGER NOT NULL DEFAULT 0 CHECK (released_quantity >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','closed')),
  created_by_admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  released_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  released_at TEXT,
  CHECK (consumed_quantity + released_quantity <= allocated_quantity),
  CHECK ((status = 'released' AND released_at IS NOT NULL) OR status <> 'released')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_offline_active_device_variant
  ON pos_offline_stock_allocations(device_id, variant_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pos_offline_allocations_device_status
  ON pos_offline_stock_allocations(device_id, status);

CREATE TABLE IF NOT EXISTS pos_offline_events (
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES pos_offline_devices(id) ON DELETE RESTRICT,
  permit_id TEXT NOT NULL REFERENCES pos_offline_permits(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  device_sequence INTEGER NOT NULL CHECK (device_sequence > 0),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  payload_json TEXT NOT NULL CHECK (length(payload_json) BETWEEN 2 AND 65536),
  device_signature_base64url TEXT NOT NULL CHECK (length(device_signature_base64url) BETWEEN 40 AND 512),
  outcome TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','accepted','conflict','rejected')),
  canonical_sale_id TEXT REFERENCES pos_sales(id) ON DELETE RESTRICT,
  reason_code TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processed_at TEXT,
  UNIQUE(device_id, device_sequence),
  CHECK ((outcome = 'accepted' AND canonical_sale_id IS NOT NULL) OR outcome <> 'accepted')
);
CREATE INDEX IF NOT EXISTS idx_pos_offline_events_device_sequence
  ON pos_offline_events(device_id, device_sequence);
CREATE INDEX IF NOT EXISTS idx_pos_offline_events_outcome
  ON pos_offline_events(outcome, received_at);

CREATE TABLE IF NOT EXISTS pos_offline_reconciliation_cases (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES pos_offline_events(event_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  reason_code TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT,
  CHECK ((status = 'resolved' AND resolved_at IS NOT NULL) OR status <> 'resolved')
);
CREATE INDEX IF NOT EXISTS idx_pos_offline_reconciliation_status
  ON pos_offline_reconciliation_cases(status, opened_at);

CREATE TABLE IF NOT EXISTS pos_offline_reconciliation_actions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES pos_offline_reconciliation_cases(id) ON DELETE RESTRICT,
  actor_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('case_opened','note_added','accepted','rejected','compensating_adjustment')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  resolution_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pos_offline_reconciliation_actions_case
  ON pos_offline_reconciliation_actions(case_id, created_at);

-- Device identity and sale evidence are immutable; revocation/status is the only mutable device state.
CREATE TRIGGER IF NOT EXISTS pos_offline_device_identity_immutable
BEFORE UPDATE OF id, register_id, enrolled_by_admin_id, public_key_jwk_json, public_key_thumbprint, created_at
ON pos_offline_devices
BEGIN
  SELECT RAISE(ABORT, 'offline device identity is immutable');
END;
CREATE TRIGGER IF NOT EXISTS pos_offline_device_no_delete
BEFORE DELETE ON pos_offline_devices
BEGIN
  SELECT RAISE(ABORT, 'offline device records cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_event_payload_immutable
BEFORE UPDATE OF event_id, device_id, permit_id, idempotency_key, device_sequence, payload_hash, payload_json, device_signature_base64url, received_at
ON pos_offline_events
BEGIN
  SELECT RAISE(ABORT, 'offline event payload is immutable');
END;
CREATE TRIGGER IF NOT EXISTS pos_offline_event_no_delete
BEFORE DELETE ON pos_offline_events
BEGIN
  SELECT RAISE(ABORT, 'offline event evidence cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_reconciliation_action_no_update
BEFORE UPDATE ON pos_offline_reconciliation_actions
BEGIN
  SELECT RAISE(ABORT, 'offline reconciliation actions are append-only');
END;
CREATE TRIGGER IF NOT EXISTS pos_offline_reconciliation_action_no_delete
BEFORE DELETE ON pos_offline_reconciliation_actions
BEGIN
  SELECT RAISE(ABORT, 'offline reconciliation actions cannot be deleted');
END;


-- Keep the existing online stock guard authoritative: every active offline allocation
-- reserves its unconsumed/unreleased units in product_variants.reserved_quantity.
-- This ensures website checkout and other online POS registers cannot sell the same units.
CREATE TRIGGER IF NOT EXISTS pos_offline_allocation_reserve_on_insert
AFTER INSERT ON pos_offline_stock_allocations
WHEN NEW.status = 'active'
BEGIN
  UPDATE product_variants
  SET reserved_quantity = reserved_quantity + NEW.allocated_quantity,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = NEW.variant_id
    AND is_active = 1
    AND stock_on_hand - reserved_quantity >= NEW.allocated_quantity;
  SELECT CASE WHEN changes() <> 1
    THEN RAISE(ABORT, 'offline allocation exceeds available stock or variant is inactive')
  END;
END;

-- Allocation quantities are a ledger: allocation size is immutable and consumed/released
-- quantities may only move forward. Active remaining allocation is reflected in reserved stock.
CREATE TRIGGER IF NOT EXISTS pos_offline_allocation_guard_update
BEFORE UPDATE ON pos_offline_stock_allocations
BEGIN
  SELECT CASE WHEN NEW.id <> OLD.id
    OR NEW.device_id <> OLD.device_id
    OR NEW.register_id <> OLD.register_id
    OR NEW.variant_id <> OLD.variant_id
    OR NEW.allocated_quantity <> OLD.allocated_quantity
    OR NEW.created_by_admin_id <> OLD.created_by_admin_id
    OR NEW.created_at <> OLD.created_at
    OR NEW.consumed_quantity < OLD.consumed_quantity
    OR NEW.released_quantity < OLD.released_quantity
    THEN RAISE(ABORT, 'offline allocation identity is immutable and quantities cannot move backwards')
  END;
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_allocation_reserve_on_update
AFTER UPDATE OF consumed_quantity, released_quantity, status ON pos_offline_stock_allocations
BEGIN
  UPDATE product_variants
  SET reserved_quantity = reserved_quantity
    + CASE WHEN NEW.status = 'active'
        THEN NEW.allocated_quantity - NEW.consumed_quantity - NEW.released_quantity
        ELSE 0
      END
    - CASE WHEN OLD.status = 'active'
        THEN OLD.allocated_quantity - OLD.consumed_quantity - OLD.released_quantity
        ELSE 0
      END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = NEW.variant_id
    AND reserved_quantity
      + CASE WHEN NEW.status = 'active'
          THEN NEW.allocated_quantity - NEW.consumed_quantity - NEW.released_quantity
          ELSE 0
        END
      - CASE WHEN OLD.status = 'active'
          THEN OLD.allocated_quantity - OLD.consumed_quantity - OLD.released_quantity
          ELSE 0
        END >= 0;
  SELECT CASE WHEN changes() <> 1
    THEN RAISE(ABORT, 'offline allocation reservation could not be reconciled')
  END;
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_allocation_no_delete
BEFORE DELETE ON pos_offline_stock_allocations
BEGIN
  SELECT RAISE(ABORT, 'offline stock allocation evidence cannot be deleted');
END;
