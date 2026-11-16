-- De VERVE commerce operating system foundation.
-- Additive migration: preserves all existing catalogue, order and enquiry records.
PRAGMA foreign_keys = ON;

-- Reusable media library. R2 object keys are stored here; credentials never belong in rows.
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video','document')),
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width_px INTEGER CHECK (width_px IS NULL OR width_px > 0),
  height_px INTEGER CHECK (height_px IS NULL OR height_px > 0),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  alt_text TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('processing','ready','archived')),
  uploaded_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_media_assets_type_status ON media_assets(media_type,status,created_at DESC);

-- Content-managed pages and safe, typed page sections. Rendering code owns section templates;
-- admins edit validated content/configuration, never arbitrary HTML or executable code.
CREATE TABLE IF NOT EXISTS site_pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'standard' CHECK (page_type IN ('home','standard','landing','policy')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_site_pages_status ON site_pages(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS site_page_sections (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES site_pages(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL CHECK (section_type IN ('hero','rich_text','image_text','image_gallery','video','product_collection','category_grid','promo_banner','contact_cta','faq')),
  position INTEGER NOT NULL CHECK (position >= 0),
  content_json TEXT NOT NULL DEFAULT '{}',
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(page_id,position)
);
CREATE INDEX IF NOT EXISTS idx_page_sections_order ON site_page_sections(page_id,position);

CREATE TABLE IF NOT EXISTS site_navigation_items (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES site_navigation_items(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_navigation_parent_position ON site_navigation_items(parent_id,position);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS collection_products (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY(collection_id,product_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_products_order ON collection_products(collection_id,position);

-- Append-only stock movement history. Existing product_variants.stock_on_hand remains the
-- fast current balance; every future stock mutation must append a matching ledger entry.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening','received','sold','customer_return','adjustment','reserved','released')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  reference_type TEXT NOT NULL DEFAULT 'manual' CHECK (reference_type IN ('manual','purchase','order','return','reservation','count')),
  reference_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  actor_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_variant_created ON inventory_movements(variant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_reference ON inventory_movements(reference_type,reference_id);

-- Server-side session and invitation records store hashes only, never raw bearer tokens.
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_expiry ON admin_sessions(admin_user_id,expires_at);

CREATE TABLE IF NOT EXISTS admin_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','catalogue','orders','rental','viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_invites_email_expiry ON admin_invites(email,expires_at);

-- Channel credentials are referenced by secret name only. OAuth tokens are held in
-- encrypted secret storage, never in D1 or client-side code.
CREATE TABLE IF NOT EXISTS sales_channels (
  id TEXT PRIMARY KEY,
  channel_key TEXT NOT NULL CHECK (channel_key IN ('daraz','facebook','instagram','whatsapp','tiktok','google','amazon','etsy','ebay','walmart','alibaba','olx','woo_commerce','shopify','wix','other')),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','pending_authorization','connected','sync_error','paused','disconnected')),
  external_account_id TEXT,
  credential_secret_name TEXT,
  granted_scopes_json TEXT NOT NULL DEFAULT '[]',
  sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0,1)),
  last_synced_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_channels_status ON sales_channels(status,channel_key);

CREATE TABLE IF NOT EXISTS channel_listings (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL,
  external_listing_id TEXT,
  external_url TEXT,
  listing_status TEXT NOT NULL DEFAULT 'draft' CHECK (listing_status IN ('draft','pending','published','rejected','paused','ended','sync_error')),
  last_synced_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(channel_id,product_id,variant_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_listing_product_no_variant ON channel_listings(channel_id,product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_listing_variant ON channel_listings(channel_id,variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_listings_product ON channel_listings(product_id,listing_status);

CREATE TABLE IF NOT EXISTS channel_sync_events (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
  listing_id TEXT REFERENCES channel_listings(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','skipped')),
  request_summary TEXT NOT NULL DEFAULT '',
  response_summary TEXT NOT NULL DEFAULT '',
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_channel_sync_events_recent ON channel_sync_events(channel_id,created_at DESC);

CREATE TABLE IF NOT EXISTS store_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value_json TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  updated_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Durable content revision snapshots support preview and rollback of published content.
CREATE TABLE IF NOT EXISTS content_revisions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('page','section','navigation','collection')),
  entity_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  snapshot_json TEXT NOT NULL,
  created_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(entity_type,entity_id,revision_number)
);
CREATE INDEX IF NOT EXISTS idx_content_revisions_entity ON content_revisions(entity_type,entity_id,revision_number DESC);
