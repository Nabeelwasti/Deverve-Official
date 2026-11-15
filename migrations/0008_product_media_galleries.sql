-- Product media galleries support multiple images and short product videos.
-- Existing cover images are migrated into the relationship table without changing product records.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS product_media_assets (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (product_id, media_asset_id)
);
CREATE INDEX IF NOT EXISTS idx_product_media_order ON product_media_assets(product_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_media_one_primary ON product_media_assets(product_id) WHERE is_primary = 1;

INSERT OR IGNORE INTO product_media_assets (product_id, media_asset_id, position, is_primary)
SELECT p.id, m.id, 0, 1
FROM products p
JOIN media_assets m ON m.id = p.image_key
WHERE m.media_type = 'image' AND m.status = 'ready';
