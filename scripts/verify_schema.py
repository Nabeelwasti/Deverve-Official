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
    "admin_invites", "admin_login_attempts", "sales_channels", "channel_listings", "channel_sync_events",
    "store_settings", "content_revisions", "product_media_assets", "rental_documents", "public_rate_limits",
    "customers", "customer_sessions", "customer_account_tokens", "order_status_events",
    "payment_attempts", "payment_webhook_events", "notification_outbox", "notification_attempts",
    "return_requests", "return_request_items", "return_status_events", "owner_notifications",
    "order_inventory_reservations",
}
actual_tables = {
    row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
}
missing = required_tables - actual_tables
assert not missing, f"Missing tables: {sorted(missing)}"

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
    "pos_sales": {"id", "receipt_number", "session_id", "subtotal_paisa", "total_paisa", "idempotency_key", "status"},
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
