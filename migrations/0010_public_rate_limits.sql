-- Atomic fixed-window abuse controls for public write endpoints.
-- Client IP addresses are hashed by the Worker; raw IP addresses are never stored.
CREATE TABLE IF NOT EXISTS public_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_public_rate_limits_expiry ON public_rate_limits(expires_at);
