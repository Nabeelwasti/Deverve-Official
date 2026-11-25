-- Add a rolling 30-minute idle timeout using the last_seen_at column already
-- present on admin_sessions since migration 0002. Do not add a duplicate column.
UPDATE admin_sessions
SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_idle_expiry
  ON admin_sessions(revoked_at,expires_at,last_seen_at);
