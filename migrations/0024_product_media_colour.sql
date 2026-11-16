-- Associate gallery photos with a product colour while retaining shared product-wide media.
ALTER TABLE product_media_assets ADD COLUMN color TEXT NOT NULL DEFAULT '' CHECK (length(color) <= 32);
CREATE INDEX IF NOT EXISTS idx_product_media_colour ON product_media_assets(product_id, color, position);
