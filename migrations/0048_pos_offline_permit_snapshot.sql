-- Persist the full signed catalogue snapshot so the enrolled cashier device can
-- retrieve and verify its own permit after an owner/manager issues it.
ALTER TABLE pos_offline_permits
  ADD COLUMN snapshot_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(snapshot_json) AND json_type(snapshot_json)='array');

CREATE TRIGGER IF NOT EXISTS pos_offline_permit_snapshot_guard
BEFORE INSERT ON pos_offline_permits
WHEN NEW.status='active'
BEGIN
  SELECT CASE WHEN COALESCE(json_array_length(NEW.snapshot_json),0) NOT BETWEEN 1 AND 30
    THEN RAISE(ABORT, 'offline permit catalogue snapshot is invalid') END;

  SELECT CASE WHEN json_array_length(NEW.snapshot_json) <> json_array_length(json_extract(NEW.claims_json,'$.allocations'))
    THEN RAISE(ABORT, 'offline permit catalogue snapshot and allocation claims differ') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.snapshot_json) item
    LEFT JOIN pos_offline_stock_allocations a
      ON a.id=json_extract(item.value,'$.allocationId')
      AND a.device_id=NEW.device_id
      AND a.variant_id=json_extract(item.value,'$.variantId')
    LEFT JOIN product_variants v ON v.id=a.variant_id
    LEFT JOIN products p ON p.id=v.product_id
    WHERE a.id IS NULL
      OR json_extract(item.value,'$.productId') IS NOT p.id
      OR json_extract(item.value,'$.productName') IS NOT p.name
      OR json_extract(item.value,'$.sku') IS NOT COALESCE(v.sku,'')
      OR json_extract(item.value,'$.size') IS NOT COALESCE(v.size,'')
      OR json_extract(item.value,'$.color') IS NOT COALESCE(v.color,'')
      OR json_extract(item.value,'$.allocatedQuantity') IS NOT (a.allocated_quantity-a.consumed_quantity-a.released_quantity)
      OR json_extract(item.value,'$.unitPricePaisa') IS NOT p.retail_price_paisa
      OR json_extract(item.value,'$.costPricePaisa') IS NOT v.cost_price_paisa
  ) THEN RAISE(ABORT, 'offline permit catalogue snapshot does not match current products and allocations') END;
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_permit_snapshot_immutable
BEFORE UPDATE OF snapshot_json ON pos_offline_permits
BEGIN
  SELECT RAISE(ABORT, 'offline permit catalogue snapshot is immutable');
END;
