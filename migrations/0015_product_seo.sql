-- Search metadata for indexable product detail pages.
-- Existing product records remain valid; owners can enrich SEO fields over time.
ALTER TABLE products ADD COLUMN seo_title TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN seo_description TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_products_published_slug ON products(status,slug);
