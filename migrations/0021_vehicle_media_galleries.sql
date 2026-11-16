-- Multiple-angle vehicle galleries. Existing cover photos become the first gallery image.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS vehicle_media_assets (
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (vehicle_id, media_asset_id)
);
CREATE INDEX IF NOT EXISTS idx_vehicle_media_order ON vehicle_media_assets(vehicle_id,position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_media_one_primary ON vehicle_media_assets(vehicle_id) WHERE is_primary = 1;
INSERT OR IGNORE INTO vehicle_media_assets (vehicle_id,media_asset_id,position,is_primary)
SELECT v.id,m.id,0,1 FROM vehicles v JOIN media_assets m ON m.id=v.image_key
WHERE m.media_type='image' AND m.status='ready';
