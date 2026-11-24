-- One-time proof-of-possession challenges for owner-authorized offline device enrollment.
-- Challenges are short-lived, single-use, and bound to the exact device/register/key fingerprint.
CREATE TABLE IF NOT EXISTS pos_offline_enrollment_challenges (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL CHECK (length(device_id) BETWEEN 36 AND 64),
  register_id TEXT NOT NULL REFERENCES pos_registers(id) ON DELETE RESTRICT,
  public_key_thumbprint TEXT NOT NULL CHECK (length(public_key_thumbprint) BETWEEN 20 AND 128),
  challenge_hash TEXT NOT NULL CHECK (length(challenge_hash) = 43),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by_admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_pos_offline_enrollment_challenges_expiry
  ON pos_offline_enrollment_challenges(expires_at, consumed_at);

CREATE TRIGGER IF NOT EXISTS pos_offline_enrollment_challenge_no_delete
BEFORE DELETE ON pos_offline_enrollment_challenges
BEGIN
  SELECT RAISE(ABORT, 'offline enrollment challenge evidence cannot be deleted');
END;
