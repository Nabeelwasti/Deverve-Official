-- Server-side permit authorization and snapshot consistency guards.
-- These triggers bind a signed permit to the exact active register, shift, cashier grant and stock snapshot.
CREATE TRIGGER IF NOT EXISTS pos_offline_permit_authorization_guard
BEFORE INSERT ON pos_offline_permits
WHEN NEW.status = 'active'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM pos_offline_devices d
    WHERE d.id=NEW.device_id AND d.register_id=NEW.register_id AND d.status='active'
  ) THEN RAISE(ABORT, 'offline permit device is not active for this register') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM pos_sessions s
    WHERE s.id=NEW.session_id AND s.register_id=NEW.register_id
      AND s.status='open' AND s.opened_by_admin_id=NEW.cashier_admin_id
  ) THEN RAISE(ABORT, 'offline permit requires the cashier own open register shift') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM admin_users u JOIN admin_pos_cashiers c ON c.admin_user_id=u.id
    WHERE u.id=NEW.cashier_admin_id AND u.is_active=1
      AND c.revoked_at IS NULL AND c.granted_at=NEW.cashier_grant_version
  ) THEN RAISE(ABORT, 'offline permit cashier grant is inactive or changed') END;

  SELECT CASE WHEN julianday(NEW.expires_at) <= julianday(NEW.issued_at)
    OR julianday(NEW.expires_at) > julianday(NEW.issued_at, '+8 hours')
    THEN RAISE(ABORT, 'offline permit duration exceeds policy') END;

  SELECT CASE WHEN json_extract(NEW.claims_json, '$.permit_id') IS NOT NEW.id
    OR json_extract(NEW.claims_json, '$.device_id') IS NOT NEW.device_id
    OR json_extract(NEW.claims_json, '$.register_id') IS NOT NEW.register_id
    OR json_extract(NEW.claims_json, '$.session_id') IS NOT NEW.session_id
    OR json_extract(NEW.claims_json, '$.cashier_admin_id') IS NOT NEW.cashier_admin_id
    OR json_extract(NEW.claims_json, '$.cashier_grant_version') IS NOT NEW.cashier_grant_version
    OR json_extract(NEW.claims_json, '$.snapshot_version') IS NOT NEW.snapshot_version
    OR json_extract(NEW.claims_json, '$.snapshot_hash') IS NOT NEW.snapshot_hash
    OR json_extract(NEW.claims_json, '$.issued_at') IS NOT NEW.issued_at
    OR json_extract(NEW.claims_json, '$.expires_at') IS NOT NEW.expires_at
    OR json_extract(NEW.claims_json, '$.max_events') IS NOT NEW.max_events
    OR json_extract(NEW.claims_json, '$.cash_only') IS NOT 1
    OR json_extract(NEW.claims_json, '$.allow_refunds') IS NOT 0
    OR json_extract(NEW.claims_json, '$.allow_voids') IS NOT 0
    OR json_extract(NEW.claims_json, '$.allow_shift_close') IS NOT 0
    THEN RAISE(ABORT, 'offline permit claims do not match the authorized database record') END;

  SELECT CASE WHEN json_valid(NEW.claims_json)=0
    OR COALESCE(json_array_length(json_extract(NEW.claims_json, '$.allocations')),0) NOT BETWEEN 1 AND 30
    THEN RAISE(ABORT, 'offline permit allocation snapshot is invalid') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM pos_offline_stock_allocations a
    WHERE a.device_id=NEW.device_id AND a.status='active'
      AND a.allocated_quantity>a.consumed_quantity+a.released_quantity
  ) <> json_array_length(json_extract(NEW.claims_json, '$.allocations'))
    THEN RAISE(ABORT, 'offline permit snapshot does not include every remaining allocation') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(json_extract(NEW.claims_json, '$.allocations')) item
    LEFT JOIN pos_offline_stock_allocations a
      ON a.id=json_extract(item.value, '$.allocation_id')
      AND a.device_id=NEW.device_id
      AND a.variant_id=json_extract(item.value, '$.variant_id')
    LEFT JOIN product_variants v ON v.id=a.variant_id
    LEFT JOIN products p ON p.id=v.product_id
    WHERE a.id IS NULL
      OR a.status <> 'active'
      OR a.allocated_quantity-a.consumed_quantity-a.released_quantity <> json_extract(item.value, '$.quantity')
      OR v.is_active <> 1
      OR p.status <> 'published'
      OR p.retail_price_paisa IS NULL
      OR p.retail_price_paisa <> json_extract(item.value, '$.unit_price_paisa')
  ) THEN RAISE(ABORT, 'offline permit snapshot does not match current reserved stock and catalogue prices') END;
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_allocation_insert_guard_during_permit
BEFORE INSERT ON pos_offline_stock_allocations
WHEN EXISTS (SELECT 1 FROM pos_offline_permits WHERE device_id=NEW.device_id AND status='active')
BEGIN
  SELECT RAISE(ABORT, 'stock allocations cannot change while an offline permit is active');
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_allocation_release_guard_during_permit
BEFORE UPDATE OF released_quantity, status ON pos_offline_stock_allocations
WHEN EXISTS (SELECT 1 FROM pos_offline_permits WHERE device_id=OLD.device_id AND status='active')
BEGIN
  SELECT RAISE(ABORT, 'stock allocations cannot be released while an offline permit is active');
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_permit_identity_immutable
BEFORE UPDATE OF id, device_id, register_id, session_id, cashier_admin_id, cashier_grant_version,
  snapshot_version, snapshot_hash, claims_json, signature_base64url, policy_version, max_events,
  issued_at, expires_at, created_at
ON pos_offline_permits
BEGIN
  SELECT RAISE(ABORT, 'offline permit claims and signature are immutable');
END;

CREATE TRIGGER IF NOT EXISTS pos_offline_permit_no_delete
BEFORE DELETE ON pos_offline_permits
BEGIN
  SELECT RAISE(ABORT, 'offline permit evidence cannot be deleted');
END;
