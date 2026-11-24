"""Apply every additive migration and smoke-check core commerce constraints."""
from pathlib import Path
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
migrations = sorted(Path("migrations").glob("*.sql"))
assert migrations, "No migrations found"
for migration in migrations:
    db.executescript(migration.read_text(encoding="utf-8"))

required_tables = {
    "products", "product_variants", "enquiries", "orders", "order_items",
    "wholesale_quotes", "vehicles", "rental_requests", "admin_users", "audit_logs",
    "media_assets", "site_pages", "site_page_sections", "site_navigation_items",
    "collections", "collection_products", "inventory_movements", "vehicle_media_assets", "financial_accounts", "financial_transactions", "pos_registers", "pos_sessions", "pos_sales", "pos_sale_items", "pos_payments", "business_expenses", "pos_sale_voids", "pos_receipt_outbox", "enquiry_email_queue", "admin_sessions",
    "admin_invites", "admin_pos_cashier_invites", "admin_pos_cashiers", "admin_login_attempts", "sales_channels", "channel_listings", "channel_sync_events",
    "store_settings", "content_revisions", "product_media_assets", "rental_documents", "public_rate_limits",
    "customers", "customer_sessions", "customer_account_tokens", "order_status_events",
    "payment_attempts", "payment_webhook_events", "notification_outbox", "notification_attempts",
    "return_requests", "return_request_items", "return_status_events", "owner_notifications",
    "pos_offline_devices", "pos_offline_permits", "pos_offline_stock_allocations", "pos_offline_events",
    "pos_offline_reconciliation_cases", "pos_offline_reconciliation_actions", "pos_offline_enrollment_challenges",
    "order_inventory_reservations", "discount_coupons", "discount_coupon_redemptions",
}
actual_tables = {
    row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
}
missing = required_tables - actual_tables
assert not missing, f"Missing tables: {sorted(missing)}"

# Emergency offline POS constraints are additive and are tested in an isolated savepoint.
db.execute("SAVEPOINT offline_pos_schema_probe")
db.execute("INSERT INTO admin_users (id,email,password_hash,role) VALUES (?,?,?,'owner')", ("offline-owner","offline-owner@example.test","hash"))
db.execute("INSERT INTO products (id,slug,name,category,audience,status,retail_price_paisa) VALUES (?,?,?,?,?,'published',?)", ("offline-product","offline-pos-product","Offline POS product","test","unisex",10000))
db.execute("INSERT INTO product_variants (id,product_id,sku,size,color,stock_on_hand,reserved_quantity,is_active) VALUES (?,?,?,?,?,?,?,1)", ("offline-variant","offline-product","OFFLINE-1","M","Black",10,0))
db.execute("INSERT INTO pos_sessions (id,register_id,opened_by_admin_id,opening_cash_paisa,status) VALUES (?,?,?,0,'open')", ("offline-session","main-register","offline-owner"))
public_jwk = '{"kty":"EC","crv":"P-256","x":"abc","y":"def"}'
db.execute("INSERT INTO pos_offline_devices (id,register_id,enrolled_by_admin_id,device_label,public_key_jwk_json,public_key_thumbprint) VALUES (?,?,?,?,?,?)", ("offline-device","main-register","offline-owner","Pilot Android POS",public_jwk,"a"*43))
db.execute("INSERT INTO pos_offline_enrollment_challenges (id,device_id,register_id,public_key_thumbprint,challenge_hash,expires_at,created_by_admin_id) VALUES (?,?,?,?,?,?,?)", ("offline-challenge","offline-device-2","main-register","z"*43,"c"*43,"2026-11-25T00:00:00.000Z","offline-owner"))
db.execute("UPDATE pos_offline_enrollment_challenges SET consumed_at='2026-11-24T01:00:00.000Z' WHERE id='offline-challenge'")
expect_challenge_update_rejected = False
try:
    db.execute("UPDATE pos_offline_enrollment_challenges SET consumed_at='2026-11-24T02:00:00.000Z' WHERE id='offline-challenge'")
except sqlite3.IntegrityError:
    expect_challenge_update_rejected = True
assert expect_challenge_update_rejected, "Enrollment challenges must be single-use and immutable after consumption"
db.execute("INSERT INTO pos_offline_permits (id,device_id,register_id,session_id,cashier_admin_id,snapshot_version,snapshot_hash,claims_json,signature_base64url,issued_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("offline-permit","offline-device","main-register","offline-session","offline-owner","snapshot-1","b"*64,"{}","c"*44,"2026-11-24T00:00:00.000Z","2026-11-24T04:00:00.000Z"))
db.execute("INSERT INTO pos_offline_stock_allocations (id,device_id,register_id,variant_id,allocated_quantity,created_by_admin_id) VALUES (?,?,?,?,?,?)", ("offline-allocation","offline-device","main-register","offline-variant",2,"offline-owner"))

def expect_integrity_error(action, message):
    try:
        action()
    except sqlite3.IntegrityError:
        return
    raise AssertionError(message)

expect_integrity_error(
    lambda: db.execute("INSERT INTO pos_offline_devices (id,register_id,enrolled_by_admin_id,device_label,public_key_jwk_json,public_key_thumbprint) VALUES (?,?,?,?,?,?)", ("offline-device-2","main-register","offline-owner","Second device",public_jwk,"d"*43)),
    "A register must not have two active emergency POS devices",
)
expect_integrity_error(
    lambda: db.execute("INSERT INTO pos_offline_permits (id,device_id,register_id,session_id,cashier_admin_id,snapshot_version,snapshot_hash,claims_json,signature_base64url,issued_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("offline-permit-2","offline-device","main-register","offline-session","offline-owner","snapshot-2","e"*64,"{}","f"*44,"2026-11-24T00:00:00.000Z","2026-11-24T04:00:00.000Z")),
    "A device must not have two active offline permits",
)
expect_integrity_error(
    lambda: db.execute("UPDATE pos_offline_stock_allocations SET consumed_quantity=2,released_quantity=1 WHERE id='offline-allocation'"),
    "Offline allocation consumption and release must never exceed the reserved quantity",
)
db.execute("INSERT INTO pos_offline_events (event_id,device_id,permit_id,idempotency_key,device_sequence,payload_hash,payload_json,device_signature_base64url) VALUES (?,?,?,?,?,?,?,?)", ("offline-event","offline-device","offline-permit","offline-idempotency",1,"1"*64,"{}","g"*44))
expect_integrity_error(
    lambda: db.execute("INSERT INTO pos_offline_events (event_id,device_id,permit_id,idempotency_key,device_sequence,payload_hash,payload_json,device_signature_base64url) VALUES (?,?,?,?,?,?,?,?)", ("offline-event-2","offline-device","offline-permit","offline-idempotency-2",1,"2"*64,"{}","h"*44)),
    "A device sequence number must be unique",
)
expect_integrity_error(
    lambda: db.execute("UPDATE pos_offline_events SET outcome='accepted' WHERE event_id='offline-event'"),
    "An accepted offline event must reference a canonical server sale",
)
expect_integrity_error(
    lambda: db.execute("UPDATE pos_offline_events SET payload_json='{\"tampered\":true}' WHERE event_id='offline-event'"),
    "Offline sale payload evidence must be immutable",
)
db.execute("INSERT INTO pos_offline_reconciliation_cases (id,event_id,reason_code) VALUES (?,?,?)", ("offline-case","offline-event","test_conflict"))
db.execute("INSERT INTO pos_offline_reconciliation_actions (id,case_id,actor_admin_id,action_type,reason) VALUES (?,?,?,?,?)", ("offline-action","offline-case","offline-owner","case_opened","Schema constraint verification"))
assert db.execute("SELECT COUNT(*) FROM pos_offline_reconciliation_actions WHERE case_id='offline-case'").fetchone()[0] == 1
expect_integrity_error(
    lambda: db.execute("UPDATE pos_offline_reconciliation_actions SET reason='edited' WHERE id='offline-action'"),
    "Offline reconciliation actions must be append-only",
)

# Offline allocations must reserve the same inventory counter used by online checkout.
reserved = db.execute("SELECT stock_on_hand,reserved_quantity FROM product_variants WHERE id='offline-variant'").fetchone()
assert reserved == (10, 2), f"Offline allocation did not reserve two units: {reserved}"
db.execute("INSERT INTO pos_registers (id,name,location_label) VALUES ('offline-register-2','Second register','Test')")
db.execute("INSERT INTO pos_offline_devices (id,register_id,enrolled_by_admin_id,device_label,public_key_jwk_json,public_key_thumbprint) VALUES (?,?,?,?,?,?)", ("offline-device-2","offline-register-2","offline-owner","Second pilot device",public_jwk,"d"*43))
expect_integrity_error(
    lambda: db.execute("INSERT INTO pos_offline_stock_allocations (id,device_id,register_id,variant_id,allocated_quantity,created_by_admin_id) VALUES (?,?,?,?,?,?)", ("offline-over-allocation","offline-device-2","offline-register-2","offline-variant",9,"offline-owner")),
    "Offline allocation must not reserve more than currently available stock across registers",
)
db.execute("UPDATE pos_offline_stock_allocations SET consumed_quantity=1 WHERE id='offline-allocation'")
reserved = db.execute("SELECT stock_on_hand,reserved_quantity FROM product_variants WHERE id='offline-variant'").fetchone()
assert reserved == (10, 1), f"Consumed offline allocation did not release its reservation: {reserved}"
db.execute("UPDATE pos_offline_stock_allocations SET released_quantity=1,status='released',released_at='2026-11-24T01:00:00.000Z' WHERE id='offline-allocation'")
reserved = db.execute("SELECT stock_on_hand,reserved_quantity FROM product_variants WHERE id='offline-variant'").fetchone()
assert reserved == (10, 0), f"Released offline allocation left reserved stock behind: {reserved}"
expect_integrity_error(
    lambda: db.execute("DELETE FROM pos_offline_stock_allocations WHERE id='offline-allocation'"),
    "Offline allocation evidence must be append-only",
)

db.execute("ROLLBACK TO offline_pos_schema_probe")
db.execute("RELEASE offline_pos_schema_probe")

# Cashier capability is additive and separately revocable; legacy admin role CHECKs remain unchanged.
admin_role_sql = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_users'").fetchone()[0]
invite_role_sql = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_invites'").fetchone()[0]
assert "'cashier'" not in admin_role_sql and "'cashier'" not in invite_role_sql, "Cashier must not bypass the legacy role constraints"
assert any(row[1] == "idx_admin_pos_cashiers_active" for row in db.execute("PRAGMA index_list(admin_pos_cashiers)")), "Active cashier grant lookup index is missing"
db.execute("INSERT INTO admin_users (id,email,password_hash,role) VALUES ('schema-owner','owner@example.test','hash','owner')")
db.execute("INSERT INTO admin_users (id,email,password_hash,role) VALUES ('schema-viewer','viewer@example.test','hash','viewer')")
db.execute("INSERT INTO admin_pos_cashiers (admin_user_id,granted_by_admin_id) VALUES ('schema-viewer','schema-owner')")
assert db.execute("SELECT COUNT(*) FROM admin_pos_cashiers WHERE admin_user_id='schema-viewer' AND revoked_at IS NULL").fetchone()[0] == 1
db.execute("UPDATE admin_pos_cashiers SET revoked_at='2026-11-23T00:00:00.000Z' WHERE admin_user_id='schema-viewer'")
assert db.execute("SELECT COUNT(*) FROM admin_pos_cashiers WHERE admin_user_id='schema-viewer' AND revoked_at IS NULL").fetchone()[0] == 0
db.execute("DELETE FROM admin_users WHERE id='schema-owner'")
db.execute("DELETE FROM admin_users WHERE id='schema-viewer'")

# Migration 0041 publishes a starter homepage only when an active owner exists; test that
# seed explicitly and prove the migration can be safely replayed without duplicate rows.
db.execute("INSERT INTO admin_users (id,email,password_hash,role) VALUES ('cms-seed-owner','cms-owner@example.test','hash','owner')")
db.executescript(Path("migrations/0041_seed_cms_homepage.sql").read_text(encoding="utf-8"))
home = db.execute("SELECT id,slug,page_type,status,seo_title FROM site_pages WHERE slug='home'").fetchone()
assert home and home[1:] == ("home", "home", "published", "De VERVE | Fashion, Wholesale & Vehicle Rentals in Jhelum"), "CMS homepage seed is missing or not published"
sections = db.execute("SELECT section_type,content_json FROM site_page_sections WHERE page_id=? ORDER BY position", (home[0],)).fetchall()
assert len(sections) == 7, f"CMS homepage should contain seven sections, found {len(sections)}"
faq_content = __import__("json").loads(next(content for kind, content in sections if kind == "faq"))
assert len(faq_content["faqs"].splitlines()) == 4, "CMS homepage FAQs must remain four separate entries"
category_content = __import__("json").loads(next(content for kind, content in sections if kind == "category_grid"))
assert category_content["categories"].replace("\\n", "\n").splitlines() == ["Sweat Shirt", "hoodie", "Trouser"], "CMS category grid line breaks are malformed"
db.executescript(Path("migrations/0042_cms_category_artwork.sql").read_text(encoding="utf-8"))
category_content = __import__("json").loads(db.execute("SELECT content_json FROM site_page_sections WHERE page_id=? AND section_type='category_grid'", (home[0],)).fetchone()[0])
assert set(category_content["category_images"]) == {"Sweat Shirt", "hoodie", "Trouser"}, "CMS category artwork mapping is incomplete"
assert category_content["category_images"]["hoodie"] == "98e4595d-7a79-4bd7-bfe6-08dc211a3673", "Hoodie artwork does not match the verified product image"
db.executescript(Path("migrations/0043_cms_category_images_json_string.sql").read_text(encoding="utf-8"))
category_content = __import__("json").loads(db.execute("SELECT content_json FROM site_page_sections WHERE page_id=? AND section_type='category_grid'", (home[0],)).fetchone()[0])
category_images = __import__("json").loads(category_content["category_images"])
assert set(category_images) == {"Sweat Shirt", "hoodie", "Trouser"}, "CMS category image JSON string is incomplete"
assert category_images["hoodie"] == "/media/98e4595d-7a79-4bd7-bfe6-08dc211a3673", "CMS category image URL is not renderer-compatible"
for media_id in ["793fae1f-d9a2-45b6-90a2-ded785964b4a", "98e4595d-7a79-4bd7-bfe6-08dc211a3673", "0c6f6c8b-2680-434b-bc60-d58b04f5cff7"]:
    reference = db.execute("SELECT 1 FROM site_page_sections ps JOIN site_pages p ON p.id=ps.page_id, json_each(json_extract(ps.content_json,'$.category_images')) ci WHERE p.status='published' AND ps.is_visible=1 AND ci.value IN (?,?) LIMIT 1", (media_id, "/media/"+media_id)).fetchone()
    assert reference, f"Published category image {media_id} is not publicly referenced"
assert db.execute("SELECT COUNT(*) FROM site_navigation_items").fetchone()[0] == 5, "CMS homepage navigation seed is incomplete"
assert db.execute("SELECT COUNT(*) FROM audit_logs WHERE action='website.homepage_seeded'").fetchone()[0] == 1, "CMS homepage seed audit event is missing"
db.executescript(Path("migrations/0041_seed_cms_homepage.sql").read_text(encoding="utf-8"))
assert db.execute("SELECT COUNT(*) FROM site_pages WHERE slug='home'").fetchone()[0] == 1, "Reapplying homepage seed created a duplicate page"
assert db.execute("SELECT COUNT(*) FROM site_page_sections WHERE page_id=?", (home[0],)).fetchone()[0] == 7, "Reapplying homepage seed duplicated sections"
db.execute("DELETE FROM site_navigation_items")
db.execute("DELETE FROM site_pages WHERE id=?", (home[0],))
db.execute("DELETE FROM audit_logs WHERE action='website.homepage_seeded'")
db.execute("DELETE FROM admin_users WHERE id='cms-seed-owner'")

reservation_columns = {row[1] for row in db.execute("PRAGMA table_info(order_inventory_reservations)")}
assert {"order_id", "variant_id", "quantity", "status", "payment_provider", "payment_reference", "reserved_at", "released_at", "consumed_at"} <= reservation_columns, "First-class order reservation lifecycle fields are missing"
assert any(row[1] == "idx_order_inventory_reservations_order_status" for row in db.execute("PRAGMA index_list(order_inventory_reservations)")), "Order reservation lifecycle index is missing"
assert any(row[1] == "idx_order_inventory_reservations_variant_status" for row in db.execute("PRAGMA index_list(order_inventory_reservations)")), "Variant reservation lifecycle index is missing"

notification_outbox_columns = {row[1] for row in db.execute("PRAGMA table_info(notification_outbox)")}
assert "processing_started_at" in notification_outbox_columns, "Owner notification lease timestamp is missing"
assert any(row[1] == "idx_notification_outbox_lease" for row in db.execute("PRAGMA index_list(notification_outbox)")), "Owner notification lease index is missing"

product_columns = {row[1] for row in db.execute("PRAGMA table_info(products)")}
assert {"seo_title", "seo_description"} <= product_columns, "Product SEO metadata columns are missing"

enquiry_columns = {row[1] for row in db.execute("PRAGMA table_info(enquiries)")}
assert "contact_type" in enquiry_columns, "Extended customer contact categories are missing"

variant_columns = {row[1] for row in db.execute("PRAGMA table_info(product_variants)")}
order_columns = {row[1] for row in db.execute("PRAGMA table_info(orders)")}
assert any(row[1] == "idx_product_variants_sku_nocase" for row in db.execute("PRAGMA index_list(product_variants)")), "Case-insensitive SKU lookup index is missing"
assert any(row[1] == "idx_product_variants_barcode" for row in db.execute("PRAGMA index_list(product_variants)")), "Barcode lookup index is missing"
assert any(row[1] == "idx_order_items_order" for row in db.execute("PRAGMA index_list(order_items)")), "Order item foreign-key lookup index is missing"
assert any(row[1] == "idx_orders_status_created" for row in db.execute("PRAGMA index_list(orders)")), "Order status/history index is missing"
assert any(row[1] == "idx_pos_sales_status_created" for row in db.execute("PRAGMA index_list(pos_sales)")), "POS status/history index is missing"
assert any(row[1] == "idx_payment_webhook_status" for row in db.execute("PRAGMA index_list(payment_webhook_events)")), "Payment webhook processing index is missing"
# Seed a representative catalogue inside a savepoint so SQLite's planner can be checked without polluting later constraint tests.
db.execute("SAVEPOINT index_probe")
for number in range(100):
    product_id = f"INDEX-PRODUCT-{number}"
    db.execute(
        "INSERT INTO products (id, slug, name, category, audience, status) VALUES (?, ?, ?, ?, 'unisex', 'published')",
        (product_id, f"index-product-{number}", f"Index product {number}", "test"),
    )
    db.execute(
        "INSERT INTO product_variants (id, product_id, sku, size, color, stock_on_hand, is_active, barcode) VALUES (?, ?, ?, 'M', 'Black', 1, 1, ?)",
        (f"INDEX-VARIANT-{number}", product_id, f"INDEX-SKU-{number}", f"INDEX-BARCODE-{number}"),
    )
db.execute("ANALYZE")
sku_plan = " ".join(str(row) for row in db.execute("EXPLAIN QUERY PLAN SELECT id FROM product_variants WHERE sku = ? COLLATE NOCASE", ("SKU-INDEX-TEST",)))
assert "idx_product_variants_sku_nocase" in sku_plan, f"Case-insensitive SKU query does not use its index: {sku_plan}"
barcode_plan = " ".join(str(row) for row in db.execute("EXPLAIN QUERY PLAN SELECT id FROM product_variants WHERE barcode = ? AND barcode IS NOT NULL AND barcode <> ?", ("BARCODE-INDEX-TEST", "")))
assert "idx_product_variants_barcode" in barcode_plan, f"Barcode query does not use its partial index: {barcode_plan}"
scan_plan = " ".join(str(row) for row in db.execute("EXPLAIN QUERY PLAN SELECT id FROM product_variants WHERE (barcode = ? AND ? <> '' AND barcode IS NOT NULL AND barcode <> '') OR (sku = ? AND ? <> '') LIMIT 2", ("BARCODE-INDEX-TEST", "BARCODE-INDEX-TEST", "SKU-INDEX-TEST", "SKU-INDEX-TEST")))
assert "MULTI-INDEX OR" in scan_plan and "idx_product_variants_barcode" in scan_plan, f"Combined barcode/SKU scan does not use indexed lookups: {scan_plan}"
order_plan = " ".join(str(row) for row in db.execute("EXPLAIN QUERY PLAN SELECT id FROM order_items WHERE order_id = ?", ("ORDER-INDEX-TEST",)))
assert "idx_order_items_order" in order_plan, f"Order-item query does not use its index: {order_plan}"
pos_status_index_sql = db.execute("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_pos_sales_status_created'").fetchone()[0]
assert "ON pos_sales(status, created_at DESC)" in pos_status_index_sql, "POS status index must lead with status and sort by creation time"
db.execute("ROLLBACK TO index_probe")
db.execute("RELEASE index_probe")
assert "reserved_quantity" in variant_columns, "COD stock reservation column is missing"
variant_option_indexes = [row for row in db.execute("PRAGMA index_list(product_variants)") if row[1] == "idx_product_variants_unique_active_options"]
assert variant_option_indexes and variant_option_indexes[0][2] == 1, "Active size/colour combinations must be unique per product"
variant_option_sql = db.execute("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_product_variants_unique_active_options'").fetchone()[0]
assert "lower(trim(size))" in variant_option_sql and "lower(trim(color))" in variant_option_sql, "Variant uniqueness must be case- and whitespace-insensitive"

assert "checkout_token" in order_columns, "Checkout idempotency column is missing"
assert "payment_provider" in order_columns, "Payment provider selection column is missing"
return_columns = {row[1] for row in db.execute("PRAGMA table_info(return_requests)")}
assert {"order_id", "customer_id", "status", "refund_amount_paisa", "refund_method", "refund_reference"} <= return_columns, "Return/refund workflow fields are missing"
assert {"delivery_fee_status", "delivery_fee_token_hash", "delivery_fee_expires_at", "delivery_fee_quote_sent_at", "delivery_fee_accepted_at"} <= order_columns, "Customer-approved delivery fee workflow fields are missing"
quote_columns = {row[1] for row in db.execute("PRAGMA table_info(wholesale_quotes)")}
assert {"approval_token", "delivery_address", "city", "converted_order_id"} <= quote_columns, "Wholesale approval fields are missing"
assert "source_quote_id" in order_columns, "Wholesale order link is missing"
media_gallery_columns = {row[1] for row in db.execute("PRAGMA table_info(product_media_assets)")}
assert {"product_id", "media_asset_id", "position", "is_primary"} <= media_gallery_columns, "Product media gallery fields are missing"
assert any(row[1] == "idx_product_media_one_primary" and row[2] == 1 for row in db.execute("PRAGMA index_list(product_media_assets)")), "Each product must have at most one primary media item"
assert "wholesale_quote_items" in actual_tables, "Wholesale quote item table is missing"
vehicle_media_columns = {row[1] for row in db.execute("PRAGMA table_info(vehicle_media_assets)")}
assert {"vehicle_id", "media_asset_id", "position", "is_primary"} <= vehicle_media_columns, "Vehicle media gallery fields are missing"
assert any(row[1] == "idx_vehicle_media_one_primary" and row[2] == 1 for row in db.execute("PRAGMA index_list(vehicle_media_assets)")), "Each vehicle must have at most one primary media item"
vehicle_columns = {row[1] for row in db.execute("PRAGMA table_info(vehicles)")}
rental_columns = {row[1] for row in db.execute("PRAGMA table_info(rental_requests)")}
assert "description" in vehicle_columns, "Vehicle description column is missing"
assert "with_driver_daily_rate_paisa" in vehicle_columns, "With-driver vehicle rate column is missing"
assert {"rental_days", "estimated_daily_rate_paisa", "estimated_total_paisa"} <= rental_columns, "Server-calculated rental estimate fields are missing"
assert {"reference_code", "email", "customer_note", "admin_note", "updated_at", "pickup_city", "pickup_address", "destination_city", "destination_address", "document_upload_token_hash", "document_upload_expires_at"} <= rental_columns, "Rental request management fields are missing"
assert "rental_documents" in actual_tables, "Private rental document table is missing"
rate_limit_columns = {row[1] for row in db.execute("PRAGMA table_info(public_rate_limits)")}
assert {"bucket_key", "window_start", "request_count", "expires_at"} <= rate_limit_columns, "Public rate-limit fields are missing"
assert any(row[1] == "idx_public_rate_limits_expiry" for row in db.execute("PRAGMA index_list(public_rate_limits)")), "Rate-limit expiry index is missing"
rate_limit_upsert = """
INSERT INTO public_rate_limits (bucket_key, window_start, request_count, expires_at)
VALUES (?, ?, 1, ?)
ON CONFLICT(bucket_key) DO UPDATE SET
  request_count = CASE WHEN public_rate_limits.window_start = excluded.window_start
    THEN public_rate_limits.request_count + 1 ELSE 1 END,
  window_start = excluded.window_start,
  expires_at = excluded.expires_at
RETURNING request_count
"""
assert db.execute(rate_limit_upsert, ("digest-key", 900, 2700)).fetchone()[0] == 1
assert db.execute(rate_limit_upsert, ("digest-key", 900, 2700)).fetchone()[0] == 2
assert db.execute(rate_limit_upsert, ("digest-key", 1800, 3600)).fetchone()[0] == 1
rental_document_columns = {row[1] for row in db.execute("PRAGMA table_info(rental_documents)")}
assert {"rental_request_id", "document_side", "object_key", "mime_type", "byte_size"} <= rental_document_columns, "Rental document fields are missing"
assert (Path("functions/media/[[path]].ts")).is_file(), "Public media URLs must be routed through the Worker authorization handler"
assert (Path("functions/api/[[path]].ts")).is_file(), "API routes must be routed through the Worker handler"


unique_indexes = {
    row[1] for row in db.execute("PRAGMA index_list(orders)") if row[2] == 1
}
assert "idx_orders_checkout_token" in unique_indexes, "Checkout token must be unique"


db.execute(
    "INSERT INTO products (id, slug, name, category, audience) VALUES (?, ?, ?, ?, ?)",
    ("p1", "sample-tee", "Sample T-shirt", "t-shirts", "unisex"),
)
db.execute(
    "INSERT INTO product_variants (id, product_id, sku, size, stock_on_hand) VALUES (?, ?, ?, ?, ?)",
    ("v1", "p1", "SAMPLE-M", "M", 5),
)
db.execute(
    "INSERT INTO enquiries (id, enquiry_type, customer_name, phone, message) VALUES (?, ?, ?, ?, ?)",
    ("e1", "retail", "Test Customer", "+923000000000", "Availability enquiry"),
)
db.execute(
    "INSERT INTO site_pages (id, slug, title, page_type) VALUES (?, ?, ?, ?)",
    ("page1", "home", "Home", "home"),
)
db.execute(
    "INSERT INTO site_page_sections (id, page_id, section_type, position, content_json) VALUES (?, ?, ?, ?, ?)",
    ("section1", "page1", "hero", 0, '{"heading":"Welcome"}'),
)
db.execute(
    "INSERT INTO inventory_movements (id, variant_id, movement_type, quantity_delta) VALUES (?, ?, ?, ?)",
    ("move1", "v1", "opening", 5),
)
db.execute(
    "INSERT INTO sales_channels (id, channel_key, display_name) VALUES (?, ?, ?)",
    ("channel1", "daraz", "Daraz"),
)
db.execute(
    "INSERT INTO channel_listings (id, channel_id, product_id) VALUES (?, ?, ?)",
    ("listing1", "channel1", "p1"),
)

assert db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 1
assert db.execute("SELECT stock_on_hand FROM product_variants WHERE id = 'v1'").fetchone()[0] == 5
assert db.execute("SELECT status FROM enquiries WHERE id = 'e1'").fetchone()[0] == "new"
db.execute("INSERT INTO enquiries (id, enquiry_type, contact_type, customer_name, phone, message) VALUES (?, ?, ?, ?, ?, ?)", ("e2", "general", "dmca", "Rights Holder", "+923000000001", "Copyright notice"))
assert db.execute("SELECT contact_type FROM enquiries WHERE id = 'e2'").fetchone()[0] == "dmca"
assert db.execute("SELECT section_type FROM site_page_sections WHERE id = 'section1'").fetchone()[0] == "hero"
assert db.execute("SELECT SUM(quantity_delta) FROM inventory_movements WHERE variant_id = 'v1'").fetchone()[0] == 5

# Authentication throttling uses a digest key; raw email and IP values are not stored.
db.execute(
    "INSERT INTO admin_login_attempts (key_hash, failure_count, window_started_at) VALUES (?, ?, ?)",
    ("digest-only", 1, "2026-11-14T00:00:00.000Z"),
)
assert db.execute("SELECT failure_count FROM admin_login_attempts WHERE key_hash = ?", ("digest-only",)).fetchone()[0] == 1

for statement, values in [
    ("INSERT INTO product_variants (id, product_id, stock_on_hand) VALUES (?, ?, ?)", ("bad", "p1", -1)),
    ("INSERT INTO products (id, slug, name, category, audience) VALUES (?, ?, ?, ?, ?)", ("bad", "bad", "Bad", "other", "aliens")),
    ("INSERT INTO enquiries (id, enquiry_type, customer_name, phone, message) VALUES (?, ?, ?, ?, ?)", ("bad", "unknown", "Name", "12345678", "Hello there")),
    ("INSERT INTO sales_channels (id, channel_key, display_name) VALUES (?, ?, ?)", ("bad-channel", "unknown-marketplace", "Unknown")),
    ("INSERT INTO site_page_sections (id, page_id, section_type, position) VALUES (?, ?, ?, ?)", ("bad-section", "page1", "raw_html", 1)),
    ("INSERT INTO admin_login_attempts (key_hash, failure_count, window_started_at) VALUES (?, ?, ?)", ("bad-attempt", -1, "2026-11-14T00:00:00.000Z")),
]:
    try:
        db.execute(statement, values)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError(f"Expected a schema constraint to reject: {statement}")

try:
    db.execute(
        "INSERT INTO channel_listings (id, channel_id, product_id) VALUES (?, ?, ?)",
        ("duplicate-listing", "channel1", "p1"),
    )
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("Duplicate product listing on the same channel was not rejected")

foreign_key_violations = db.execute("PRAGMA foreign_key_check").fetchall()
assert not foreign_key_violations, f"Foreign key violations: {foreign_key_violations}"

print(
    f"Schema smoke check passed: {len(migrations)} migrations, "
    f"{len(required_tables)} tables, constraints and foreign keys verified."
)

# POS and cashbook foundations are append-only and share the same stock ledger.
variant_columns = {row[1] for row in db.execute("PRAGMA table_info(product_variants)")}
assert {"barcode", "cost_price_paisa", "reorder_level"} <= variant_columns, "Inventory/POS variant fields are missing"
for table, columns in {
    "financial_accounts": {"id", "name", "kind", "opening_balance_paisa", "is_active"},
    "financial_transactions": {"id", "account_id", "direction", "amount_paisa", "category", "reference_type", "reference_id", "register_session_id"},
    "pos_registers": {"id", "name", "is_active"},
    "pos_sessions": {"id", "register_id", "opening_cash_paisa", "status", "expected_cash_paisa", "counted_cash_paisa"},
    "pos_sales": {"id", "receipt_number", "session_id", "subtotal_paisa", "total_paisa", "idempotency_key", "request_fingerprint", "status"},
    "pos_sale_items": {"id", "sale_id", "variant_id", "quantity", "unit_price_paisa", "unit_cost_paisa"},
    "pos_payments": {"id", "sale_id", "account_id", "amount_paisa", "tendered_paisa", "change_paisa"},
    "business_expenses": {"id", "category", "amount_paisa", "account_id", "financial_transaction_id", "status"},
    "pos_sale_voids": {"sale_id", "voided_by_admin_id", "reason", "created_at"},
}.items():
    actual = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
    assert columns <= actual, f"{table} is missing required fields: {columns - actual}"
assert any(row[1] == "idx_pos_one_open_session" and row[2] == 1 for row in db.execute("PRAGMA index_list(pos_sessions)")), "Only one open session per register must be allowed"
assert any(row[1] == "idx_financial_transactions_account_date" for row in db.execute("PRAGMA index_list(financial_transactions)")), "Financial ledger account/date index is missing"

quote_item_columns = {row[1] for row in db.execute("PRAGMA table_info(wholesale_quote_items)")}
assert {"unit_cost_paisa"} <= quote_item_columns, "Wholesale quotation cost snapshots are missing"
order_item_columns = {row[1] for row in db.execute("PRAGMA table_info(order_items)")}
assert {"unit_cost_paisa"} <= order_item_columns, "Website order item cost snapshots are missing"
assert any(row[1] == "idx_financial_transaction_reversal" and row[2] == 1 for row in db.execute("PRAGMA index_list(financial_transactions)")), "Refunds must not reverse the same financial entry twice"

product_media_columns = {row[1] for row in db.execute("PRAGMA table_info(product_media_assets)")}
assert {"color"} <= product_media_columns, "Colour-specific product gallery metadata is missing"

# POS email invoices are transactional when a customer email is provided; WhatsApp receipts require a recorded platform opt-in.
pos_sale_columns = {row[1] for row in db.execute("PRAGMA table_info(pos_sales)")}
assert {"customer_email", "email_receipt_requested", "whatsapp_receipt_consent"} <= pos_sale_columns, "POS receipt contact and consent fields are missing"
receipt_outbox_columns = {row[1] for row in db.execute("PRAGMA table_info(pos_receipt_outbox)")}
assert {"sale_id", "channel", "status", "attempts", "next_attempt_at", "provider_message_id", "last_error_code"} <= receipt_outbox_columns, "POS receipt delivery outbox fields are missing"
assert any(row[1] == "idx_pos_receipt_outbox_due" for row in db.execute("PRAGMA index_list(pos_receipt_outbox)")), "POS receipt delivery queue index is missing"

email_queue_columns = {row[1] for row in db.execute("PRAGMA table_info(enquiry_email_queue)")}
assert {"status", "attempts", "next_attempt_at", "processing_started_at"} <= email_queue_columns, "Enquiry email queue lease fields are missing"
assert any(row[1] == "idx_enquiry_email_queue_lease" for row in db.execute("PRAGMA index_list(enquiry_email_queue)")), "Enquiry email queue lease index is missing"

# Permanent CNIC evidence guards: no document row deletion, metadata mutation,
# or cascade deletion of the linked rental request may succeed.
cnic_triggers = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='rental_documents'")}
assert {"trg_rental_documents_no_delete", "trg_rental_documents_no_update"} <= cnic_triggers, "Permanent CNIC evidence protection triggers are missing"
db.execute("INSERT INTO rental_requests (id,customer_name,phone,pickup_location,pickup_at,return_at,driver_option) VALUES (?,?,?,?,?,?,?)", ("cnic-retention-test", "Evidence Test", "+923000000000", "Jhelum", "2026-11-20T10:00:00Z", "2026-11-21T10:00:00Z", "self_drive"))
db.execute("INSERT INTO rental_documents (id,rental_request_id,document_side,object_key,mime_type,byte_size) VALUES (?,?,?,?,?,?)", ("cnic-retention-doc", "cnic-retention-test", "cnic_front", "rental-private/cnic-retention-test/front.jpg", "image/jpeg", 1024))
for statement, values in [
    ("DELETE FROM rental_documents WHERE id=?", ("cnic-retention-doc",)),
    ("DELETE FROM rental_requests WHERE id=?", ("cnic-retention-test",)),
    ("UPDATE rental_documents SET object_key=? WHERE id=?", ("rental-private/changed.jpg", "cnic-retention-doc")),
]:
    try:
        db.execute(statement, values)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError(f"Permanent CNIC evidence protection failed to reject: {statement}")
assert db.execute("SELECT object_key FROM rental_documents WHERE id='cnic-retention-doc'").fetchone()[0] == "rental-private/cnic-retention-test/front.jpg"


# Discount vouchers are stored as one-way hashes and exchange compensation is case/customer bound.
coupon_columns = {row[1] for row in db.execute("PRAGMA table_info(discount_coupons)")}
assert {"code_hash", "purpose", "discount_type", "discount_value", "max_discount_paisa", "min_subtotal_paisa", "customer_id", "exchange_request_id", "starts_at", "expires_at", "max_redemptions", "per_customer_limit", "usage_count", "is_active"} <= coupon_columns, "Discount voucher eligibility and audit fields are missing"
redemption_columns = {row[1] for row in db.execute("PRAGMA table_info(discount_coupon_redemptions)")}
assert {"coupon_id", "order_id", "customer_id", "exchange_request_id", "discount_amount_paisa"} <= redemption_columns, "Coupon redemption ledger fields are missing"
assert any(row[1] == "idx_discount_coupons_active_window" for row in db.execute("PRAGMA index_list(discount_coupons)")), "Active voucher lookup index is missing"
assert any(row[1] == "idx_coupon_redemptions_coupon_customer" for row in db.execute("PRAGMA index_list(discount_coupon_redemptions)")), "Per-customer redemption lookup index is missing"
coupon_sql = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='discount_coupons'").fetchone()[0]
assert "code_hash" in coupon_sql and "exchange_compensation" in coupon_sql and "per_customer_limit" in coupon_sql, "Voucher storage must enforce hashed codes and exchange restrictions"
redemption_unique_indexes = [row[1] for row in db.execute("PRAGMA index_list(discount_coupon_redemptions)") if row[2] == 1]
unique_columns = [tuple(info[2] for info in db.execute(f"PRAGMA index_info({index_name})")) for index_name in redemption_unique_indexes]
assert ("order_id",) in unique_columns and ("exchange_request_id",) in unique_columns, "Orders and exchange cases must not receive duplicate voucher redemptions"


# Customer voucher schema: hashed codes, strict exchange binding and atomic immutable redemption.
coupon_columns = {row[1] for row in db.execute("PRAGMA table_info(discount_coupons)")}
assert {"code_hash", "code_prefix", "purpose", "discount_type", "discount_value", "max_discount_paisa", "min_subtotal_paisa", "customer_id", "exchange_request_id", "starts_at", "expires_at", "max_redemptions", "per_customer_limit", "usage_count", "is_active"} <= coupon_columns, "Voucher eligibility and usage fields are missing"
assert "code" not in coupon_columns, "Plaintext voucher codes must never be persisted"
redemption_columns = {row[1] for row in db.execute("PRAGMA table_info(discount_coupon_redemptions)")}
assert {"coupon_id", "order_id", "customer_id", "exchange_request_id", "discount_amount_paisa", "status", "reversed_at", "reversal_reason"} <= redemption_columns, "Voucher redemption ledger and cancellation reversal fields are missing"
coupon_triggers = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
assert {"trg_coupon_redemption_validate", "trg_coupon_redemption_increment", "trg_coupon_redemption_immutable_update", "trg_coupon_redemption_immutable_delete", "trg_coupon_redemption_reversal_decrement", "trg_coupon_order_cancel_reversal"} <= coupon_triggers, "Voucher redemption must be validated, counted and immutable inside D1"
redemption_unique_indexes = [row[1] for row in db.execute("PRAGMA index_list(discount_coupon_redemptions)") if row[2] == 1]
redemption_unique_columns = [tuple(info[2] for info in db.execute(f"PRAGMA index_info({index_name})")) for index_name in redemption_unique_indexes]
assert ("order_id",) in redemption_unique_columns and ("exchange_request_id",) in redemption_unique_columns, "An order or exchange case cannot redeem more than one voucher"
assert any(row[1] == "idx_discount_coupons_one_per_exchange" and row[2] == 1 for row in db.execute("PRAGMA index_list(discount_coupons)")), "An exchange case cannot receive multiple compensation vouchers"
assert any(row[1] == "idx_coupon_redemptions_one_active_exchange" and row[2] == 1 for row in db.execute("PRAGMA index_list(discount_coupon_redemptions)")), "Only one active redemption can exist per exchange case"
coupon_sql = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='discount_coupons'").fetchone()[0]
assert "exchange_compensation" in coupon_sql and "COALESCE(max_redemptions,0) = 1" in coupon_sql, "Exchange vouchers must be customer/case bound and single-use"
coupon_trigger_sql = db.execute("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_coupon_redemption_validate'").fetchone()[0]
assert "c.purpose != 'wholesale'" in coupon_trigger_sql and "c.purpose != 'first_order'" in coupon_trigger_sql, "Wholesale vouchers must remain disabled and first-order vouchers must check prior orders"
assert "o.customer_id = NEW.customer_id" in coupon_trigger_sql and "o.discount_amount_paisa = NEW.discount_amount_paisa" in coupon_trigger_sql and "c.exchange_request_id IS NEW.exchange_request_id" in coupon_trigger_sql, "Redemption must match the order customer, exact discount and exchange binding"
assert "r.status='redeemed'" in coupon_trigger_sql and "trg_coupon_order_cancel_reversal" in coupon_triggers, "Cancelled orders must reverse coupon usage and release customer limits"
assert "NEW.discount_amount_paisa <= c.max_discount_paisa" in coupon_trigger_sql and "c.discount_type != 'percent'" in coupon_trigger_sql, "Database redemption must enforce voucher discount caps and percentage limits"
assert "(SELECT customer_id FROM orders WHERE id = NEW.order_id) = NEW.customer_id" in coupon_trigger_sql, "Voucher redemption must be bound to the same customer as the order"


# Exercise one-time exchange voucher redemption, order-cancel reversal, and safe reuse.
db.execute(
    "INSERT INTO customers (id,email,password_hash,full_name,phone) VALUES (?,?,?,?,?)",
    ("coupon-customer", "coupon-customer@example.test", "test-hash", "Coupon Customer", "+923000000001"),
)
db.execute(
    "INSERT INTO orders (id,order_number,customer_name,phone,delivery_address,city,subtotal_paisa,total_paisa,customer_id,order_status) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ("coupon-source-order", "DV-COUPON-SOURCE", "Coupon Customer", "+923000000001", "Test address", "Jhelum", 10000, 10000, "coupon-customer", "delivered"),
)
db.execute(
    "INSERT INTO exchange_requests (id,order_id,customer_id,exchange_number,reason,details,status,completed_at) VALUES (?,?,?,?,?,?,?,?)",
    ("coupon-exchange", "coupon-source-order", "coupon-customer", "EX-COUPON-TEST", "size_issue", "Size exchange test", "completed", "2026-11-21T00:00:00.000Z"),
)
db.execute(
    "INSERT INTO discount_coupons (id,code_hash,code_prefix,label,purpose,discount_type,discount_value,max_discount_paisa,min_subtotal_paisa,customer_id,exchange_request_id,starts_at,expires_at,max_redemptions,per_customer_limit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ("coupon-test", "sha256-test", "DV-TEST…", "Size exchange support", "size_exchange", "percent", 500, 500, 0, "coupon-customer", "coupon-exchange", "2026-11-20T00:00:00.000Z", "2026-12-21T00:00:00.000Z", 1, 1),
)
db.execute(
    "INSERT INTO orders (id,order_number,customer_name,phone,delivery_address,city,subtotal_paisa,total_paisa,customer_id,order_status,discount_amount_paisa,discount_code,discount_label) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ("coupon-order-one", "DV-COUPON-ONE", "Coupon Customer", "+923000000001", "Test address", "Jhelum", 10000, 9500, "coupon-customer", "pending", 500, "DV-TEST…", "Size exchange support"),
)
db.execute(
    "INSERT INTO discount_coupon_redemptions (id,coupon_id,order_id,customer_id,exchange_request_id,discount_amount_paisa) VALUES (?,?,?,?,?,?)",
    ("coupon-redemption-one", "coupon-test", "coupon-order-one", "coupon-customer", "coupon-exchange", 500),
)
assert db.execute("SELECT usage_count FROM discount_coupons WHERE id='coupon-test'").fetchone()[0] == 1
db.execute("UPDATE orders SET order_status='cancelled' WHERE id='coupon-order-one'")
reversed_redemption = db.execute("SELECT status,reversed_at,reversal_reason FROM discount_coupon_redemptions WHERE id='coupon-redemption-one'").fetchone()
assert reversed_redemption[0] == "reversed" and reversed_redemption[1] and reversed_redemption[2] == "order_cancelled"
assert db.execute("SELECT usage_count FROM discount_coupons WHERE id='coupon-test'").fetchone()[0] == 0

db.execute(
    "INSERT INTO orders (id,order_number,customer_name,phone,delivery_address,city,subtotal_paisa,total_paisa,customer_id,order_status,discount_amount_paisa,discount_code,discount_label) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ("coupon-order-two", "DV-COUPON-TWO", "Coupon Customer", "+923000000001", "Test address", "Jhelum", 10000, 9500, "coupon-customer", "pending", 500, "DV-TEST…", "Size exchange support"),
)
db.execute(
    "INSERT INTO discount_coupon_redemptions (id,coupon_id,order_id,customer_id,exchange_request_id,discount_amount_paisa) VALUES (?,?,?,?,?,?)",
    ("coupon-redemption-two", "coupon-test", "coupon-order-two", "coupon-customer", "coupon-exchange", 500),
)
assert db.execute("SELECT usage_count FROM discount_coupons WHERE id='coupon-test'").fetchone()[0] == 1
assert db.execute("SELECT COUNT(*) FROM discount_coupon_redemptions WHERE exchange_request_id='coupon-exchange' AND status='redeemed'").fetchone()[0] == 1
