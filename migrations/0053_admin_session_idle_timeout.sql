-- Add a rolling 30-minute idle timeout to the existing 12-hour absolute admin session.
ALTER TABLE admin_sessions ADD COLUMN last_seen_at TEXT;
UPDATE admin_sessions SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE last_seen_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_sessions_idle_expiry
  ON admin_sessions(revoked_at,expires_at,last_seen_at);
