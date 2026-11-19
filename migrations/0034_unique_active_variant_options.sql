-- Enforce one active stock balance for each purchasable size/colour combination.
-- Legacy rows containing comma/semicolon/pipe/newline-separated options are
-- intentionally excluded until staff reconcile and deactivate those shared-stock rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_unique_active_options
ON product_variants (
  product_id,
  lower(trim(size)),
  lower(trim(color))
)
WHERE is_active = 1
  AND instr(size, ',') = 0
  AND instr(size, ';') = 0
  AND instr(size, '|') = 0
  AND instr(size, char(10)) = 0
  AND instr(color, ',') = 0
  AND instr(color, ';') = 0
  AND instr(color, '|') = 0
  AND instr(color, char(10)) = 0;
