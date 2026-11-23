-- Least-privilege POS cashier capability without rebuilding admin_users or weakening its role CHECK.
-- A cashier remains a viewer in the legacy role column; the separate capability is independently
-- granted, revoked and checked by the server on every POS request.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_pos_cashier_invites (
  invite_id TEXT PRIMARY KEY REFERENCES admin_invites(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS admin_pos_cashiers (
  admin_user_id TEXT PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
  granted_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  CHECK (revoked_at IS NULL OR length(revoked_at) >= 20)
);

CREATE INDEX IF NOT EXISTS idx_admin_pos_cashiers_active
  ON admin_pos_cashiers(admin_user_id) WHERE revoked_at IS NULL;
