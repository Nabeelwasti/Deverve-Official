-- Media assets are already defined by 0002_commerce_os_foundation.sql.
-- Keep this migration additive and aligned with that canonical schema.
CREATE INDEX IF NOT EXISTS idx_media_assets_status_created
  ON media_assets(status, created_at DESC);
