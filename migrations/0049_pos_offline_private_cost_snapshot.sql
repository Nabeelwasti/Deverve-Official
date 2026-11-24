-- Keep acquisition cost in the server-only permit record. Cashier devices receive
-- the signed retail catalogue only; purchase cost never appears in public claims or snapshots.
ALTER TABLE pos_offline_permits
  ADD COLUMN cost_snapshot_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(cost_snapshot_json) AND json_type(cost_snapshot_json)='array');

CREATE TRIGGER IF NOT EXISTS pos_offline_permit_cost_snapshot_guard
BEFORE INSERT ON pos_offline_permits
WHEN NEW.status='active'
BEGIN
  SELECT CASE WHEN COALESCE(json_array_length(NEW.cost_snapshot_json),0) NOT BETWEEN 1 AND 30
    THEN RAISE(ABORT, 'offline permit server cost snapshot is invalid') END;

  SELECT CASE WHEN json_array_length(NEW.cost_snapshot_json) <> json_array_length(json_extract(NEW.claims_json,'$.allocations'))
    THEN RAISE(ABORT, 'offline permit server cost snapshot and public allocation claims differ') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.cost_snapshot_json) item
    LEFT JOIN pos_offline_stock_allocations a
      ON a.id=json_extract(item.value,'$.allocationId')
      AND a.device_id=NEW.device_id
      AND a.variant_id=json_extract(item.value,'$.variantId')
    LEFT JOIN product_variants v ON v.id=a.variant_id
    WHERE a.id IS NULL
      OR json_extract(item.value,'$.costPricePaisa') IS NOT COALESCE(v.cost_price_paisa,0)
  ) THEN RAISE(ABORT, 'offline permit server cost snapshot does not match current reserved stock costs') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(json_extract(NEW.claims_json,'$.allocations')) claim
    WHERE NOT EXISTS (
      SELECT 1 FROM json_each(NEW.cost_snapshot_json) item
      WHERE json_extract(item.value,'$.allocationId')=json_extract(claim.value,'$.allocation_id')
        AND json_extract(item.value,'$.variantId')=json_extract(claim.value,'$.variant_id')
    )
  ) THEN RAISE(ABORT, 'offline permit server cost snapshot does not cover every public allocation') END;
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_permit_cost_snapshot_immutable
BEFORE UPDATE OF cost_snapshot_json ON pos_offline_permits
BEGIN
  SELECT RAISE(ABORT, 'offline permit server cost snapshot is immutable');
END;
