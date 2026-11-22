-- Close measured POS query-plan gaps found in the live production schema audit.
-- SKU already has a unique BINARY autoindex; add a NOCASE companion for case-insensitive admin lookup.
CREATE INDEX IF NOT EXISTS idx_product_variants_sku_nocase
  ON product_variants(sku COLLATE NOCASE)
  WHERE sku IS NOT NULL AND sku <> '';

-- The existing POS history index leads with created_at, so status-only filtering scans it.
CREATE INDEX IF NOT EXISTS idx_pos_sales_status_created
  ON pos_sales(status, created_at DESC);
