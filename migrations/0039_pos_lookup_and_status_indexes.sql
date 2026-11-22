-- Close measured catalogue and POS filter gaps found in the live production schema audit.
-- SKU lookups are a primary POS path; the existing barcode index remains separate.
CREATE INDEX IF NOT EXISTS idx_product_variants_sku
  ON product_variants(sku)
  WHERE sku IS NOT NULL AND sku <> '';

-- POS history and summary queries filter completed/voided state and sort by time.
CREATE INDEX IF NOT EXISTS idx_pos_sales_status_created
  ON pos_sales(status, created_at DESC);
