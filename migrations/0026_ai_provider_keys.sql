CREATE TABLE IF NOT EXISTS ai_provider_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider = 'gemini'),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  key_ciphertext TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL UNIQUE,
  encryption_mode TEXT NOT NULL DEFAULT 'bootstrap-derived' CHECK (encryption_mode IN ('dedicated','bootstrap-derived')),
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  failure_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  last_used_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_provider_keys_order
  ON ai_provider_keys(provider, enabled, priority, created_at);
