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
    "collections", "collection_products", "inventory_movements", "admin_sessions",
    "admin_invites", "admin_login_attempts", "sales_channels", "channel_listings", "channel_sync_events",
    "store_settings", "content_revisions",
}
actual_tables = {
    row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
}
missing = required_tables - actual_tables
assert not missing, f"Missing tables: {sorted(missing)}"

variant_columns = {row[1] for row in db.execute("PRAGMA table_info(product_variants)")}
order_columns = {row[1] for row in db.execute("PRAGMA table_info(orders)")}
assert "reserved_quantity" in variant_columns, "COD stock reservation column is missing"
assert "checkout_token" in order_columns, "Checkout idempotency column is missing"
quote_columns = {row[1] for row in db.execute("PRAGMA table_info(wholesale_quotes)")}
assert {"approval_token", "delivery_address", "city", "converted_order_id"} <= quote_columns, "Wholesale approval fields are missing"
assert "source_quote_id" in order_columns, "Wholesale order link is missing"
assert "wholesale_quote_items" in actual_tables, "Wholesale quote item table is missing"
vehicle_columns = {row[1] for row in db.execute("PRAGMA table_info(vehicles)")}
rental_columns = {row[1] for row in db.execute("PRAGMA table_info(rental_requests)")}
assert "description" in vehicle_columns, "Vehicle description column is missing"
assert {"reference_code", "email", "customer_note", "admin_note", "updated_at"} <= rental_columns, "Rental request management fields are missing"


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
