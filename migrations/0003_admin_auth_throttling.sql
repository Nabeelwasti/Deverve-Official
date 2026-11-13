-- Persistent, privacy-preserving login throttling.
-- Keys are SHA-256 digests of normalized login/IP tuples; raw IPs are never stored.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  key_hash TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_updated ON admin_login_attempts(updated_at);
