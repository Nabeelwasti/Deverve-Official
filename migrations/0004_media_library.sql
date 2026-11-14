-- Private media library metadata. Binary objects are stored in the private R2 bucket.
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp','image/gif')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5000000),
  uploaded_by TEXT NOT NULL REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_assets_active_created ON media_assets(archived_at, created_at DESC);
