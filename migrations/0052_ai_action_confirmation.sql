-- Short-lived, one-time approvals for AI-interpreted business actions.
CREATE TABLE IF NOT EXISTS admin_ai_action_confirmations (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  command TEXT NOT NULL CHECK (length(trim(command)) BETWEEN 1 AND 1200),
  command_sha256 TEXT NOT NULL CHECK (length(command_sha256)=64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_ai_action_confirmations_pending
  ON admin_ai_action_confirmations(admin_user_id,expires_at,consumed_at);
