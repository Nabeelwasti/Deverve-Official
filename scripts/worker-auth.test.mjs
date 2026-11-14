import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../.test-dist/worker/index.js";

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, " ").trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    const q = this.sql;
    const v = this.values;
    if (q.startsWith("SELECT s.id, s.admin_user_id")) {
      const session = [...this.db.sessions.values()].find((item) => item.token_hash === v[0] && !item.revoked_at && item.expires_at > v[1]);
      const admin = session && this.db.admins.get(session.admin_user_id);
      return admin?.is_active ? { id: session.id, admin_user_id: admin.id, email: admin.email, role: admin.role, is_active: admin.is_active, expires_at: session.expires_at, revoked_at: session.revoked_at } : null;
    }
    if (q.startsWith("SELECT v.id, v.product_id, v.sku, v.size, v.color, v.stock_on_hand, v.reserved_quantity, p.name, p.wholesale_price_paisa")) {
      const variant = this.db.variants.get(v[0]); const product = variant && this.db.products.get(variant.product_id);
      return variant && product ? { ...variant, reserved_quantity: variant.reserved_quantity ?? 0, name: product.name, wholesale_price_paisa: product.wholesale_price_paisa, retail_price_paisa: product.retail_price_paisa } : null;
    }
    if (q.startsWith("SELECT id, status, valid_until, approval_token FROM wholesale_quotes WHERE id = ?")) return this.db.wholesaleQuotes.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, business_name, contact_name, phone, email, delivery_address, requested_items, quoted_total_paisa, status, valid_until, city, approval_token, converted_order_id FROM wholesale_quotes WHERE approval_token = ?")) return [...this.db.wholesaleQuotes.values()].find((row) => row.approval_token === v[0]) ?? null;
    if (q.startsWith("SELECT order_number, total_paisa, order_status FROM orders WHERE checkout_token")) {
      return [...this.db.orders.values()].find((row) => row.checkout_token === v[0]) ?? null;
    }
    if (q.startsWith("SELECT v.id, v.product_id, v.sku, v.size, v.color, v.stock_on_hand, v.reserved_quantity, p.name, p.retail_price_paisa")) {
      const variant = this.db.variants.get(v[0]);
      const product = variant && this.db.products.get(variant.product_id);
      return variant && product ? { ...variant, reserved_quantity: variant.reserved_quantity ?? 0, name: product.name, retail_price_paisa: product.retail_price_paisa } : null;
    }
    if (q.startsWith("SELECT order_number, total_paisa, order_status FROM orders WHERE id = ?")) { const row = [...this.db.orders.values()].find((item) => item.id === v[0]); return row ?? null; }
    if (q.startsWith("SELECT id, order_status FROM orders WHERE id = ?")) return this.db.orders.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, email, role, is_active, password_hash FROM admin_users")) {
      return [...this.db.admins.values()].find((item) => item.email.toLowerCase() === String(v[0]).toLowerCase()) ?? null;
    }
    if (q.startsWith("SELECT failure_count, locked_until")) return this.db.attempts.get(v[0]) ?? null;
    if (q.startsWith("SELECT locked_until")) return this.db.attempts.get(v[0]) ?? null;
    if (q.startsWith("SELECT id FROM products WHERE slug = ?")) {
      return [...this.db.products.values()].find((item) => item.slug === v[0] && (!v[1] || item.id !== v[1])) ?? null;
    }
    if (q.startsWith("SELECT id, enquiry_type, customer_name, phone, email, message, status, source, created_at FROM enquiries WHERE id = ?")) return this.db.enquiries.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, status FROM products WHERE id = ?")) { const row = this.db.products.get(v[0]); return row ? { id: row.id, status: row.status } : null; }
    if (q.startsWith("SELECT id, product_id, sku, size, color, stock_on_hand, is_active, created_at, updated_at FROM product_variants WHERE id = ?")) return this.db.variants.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, stock_on_hand, is_active FROM product_variants WHERE id = ?")) { const row = this.db.variants.get(v[0]); return row ? { id: row.id, stock_on_hand: row.stock_on_hand, is_active: row.is_active } : null; }
    if (q.startsWith("SELECT id FROM product_variants WHERE id = ?")) { const row = this.db.variants.get(v[0]); return row ? { id: row.id } : null; }
    if (q.startsWith("SELECT id, slug, name, description, category, audience, status")) return this.db.products.get(v[0]) ?? null;
    if (q.startsWith("SELECT id FROM products WHERE id = ?")) return this.db.products.get(v[0]) ?? null;
    if (q.startsWith("SELECT (SELECT COUNT(*)")) return { published_products: 0, draft_products: this.db.products.size, new_enquiries: 0, pending_orders: 0, rental_requests: 0 };
    if (q.startsWith("SELECT 1 AS ok")) return { ok: 1 };
    throw new Error("Unexpected first query: " + q);
  }
  async all() {
    const q = this.sql;
    const v = this.values;
    if (q.startsWith("SELECT id, product_id, sku, size, color, stock_on_hand, reserved_quantity FROM product_variants WHERE is_active = 1")) {
      const ids = new Set(v);
      return { success: true, results: [...this.db.variants.values()].filter((row) => ids.has(row.product_id)).map((row) => ({ ...row, reserved_quantity: row.reserved_quantity ?? 0 })) };
    }
    if (q.startsWith("SELECT id, enquiry_id, business_name, contact_name, phone, email, requested_items, quoted_total_paisa, status, valid_until, delivery_address, city, customer_note, approval_token, converted_order_id, created_at, updated_at FROM wholesale_quotes")) {
      return { success: true, results: [...this.db.wholesaleQuotes.values()].slice(0, 100) };
    }
    if (q.startsWith("SELECT id, quote_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id IN")) {
      const ids = new Set(v); return { success: true, results: this.db.wholesaleQuoteItems.filter((row) => ids.has(row.quote_id)) };
    }
    if (q.startsWith("SELECT product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id = ?")) {
      return { success: true, results: this.db.wholesaleQuoteItems.filter((row) => row.quote_id === v[0]).map(({ product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa }) => ({ product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa })) };
    }
    if (q.startsWith("SELECT variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id = ?")) {
      return { success: true, results: this.db.wholesaleQuoteItems.filter((row) => row.quote_id === v[0]) };
    }
    if (q.startsWith("SELECT id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa")) {
      return { success: true, results: [...this.db.orders.values()].slice(0, v[0]) };
    }
    if (q.startsWith("SELECT id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM order_items WHERE order_id IN")) {
      const ids = new Set(v);
      return { success: true, results: this.db.orderItems.filter((row) => ids.has(row.order_id)) };
    }
    if (q.startsWith("SELECT id, variant_id, quantity FROM order_items WHERE order_id = ?")) {
      return { success: true, results: this.db.orderItems.filter((row) => row.order_id === v[0]) };
    }
    if (q.startsWith("SELECT id, product_id, sku, size, color, stock_on_hand, reserved_quantity, is_active, created_at, updated_at FROM product_variants WHERE product_id = ?")) {
      return { success: true, results: [...this.db.variants.values()].filter((row) => row.product_id === v[0]) };
    }
    if (q.startsWith("SELECT id, movement_type, quantity_delta, reference_type, reference_id, note, created_at FROM inventory_movements WHERE variant_id = ?")) {
      return { success: true, results: this.db.movements.filter((row) => row.variant_id === v[0]).slice(0, 100) };
    }
    if (q.startsWith("SELECT id, enquiry_type, customer_name, phone, email, message, status, source, created_at FROM enquiries")) {
      const rows = [...this.db.enquiries.values()].filter((item) => !q.includes("WHERE enquiry_type = 'rental'") || item.enquiry_type === "rental");
      return { success: true, results: rows.slice(0, v[0]) };
    }
    if (q.startsWith("SELECT id, slug, name, description, category, audience, retail_price_paisa, image_key FROM products")) {
      const category = q.includes("category = ?") ? v[0] : null;
      const limit = v[v.length - 1];
      const rows = [...this.db.products.values()].filter((row) => row.status === "published" && (!category || row.category === category));
      return { success: true, results: rows.slice(0, limit) };
    }
    if (q.startsWith("SELECT id, slug, name, description, category, audience, status,")) {
      const rows = [...this.db.products.values()].filter((item) => !q.includes("WHERE status = ?") || item.status === v[0]).slice(0, q.includes("LIMIT ?") ? v[v.length - 1] : undefined);
      return { success: true, results: rows };
    }
    throw new Error("Unexpected all query: " + q);
  }
  async run() {
    const q = this.sql;
    const v = this.values;
    if (q.startsWith("INSERT INTO wholesale_quotes")) {
      const [id, enquiry_id, business_name, contact_name, phone, email, requested_items, quoted_total_paisa, valid_until, delivery_address, city, customer_note, approval_token, updated_at] = v;
      this.db.wholesaleQuotes.set(id, { id, enquiry_id, business_name, contact_name, phone, email, requested_items, quoted_total_paisa, status: "prepared", valid_until, delivery_address, city, customer_note, approval_token, converted_order_id: null, created_at: updated_at, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO wholesale_quote_items")) {
      const [id, quote_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa] = v;
      if (!this.db.wholesaleQuotes.has(quote_id)) return { success: true, meta: { changes: 0 } };
      this.db.wholesaleQuoteItems.push({ id, quote_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE wholesale_quotes SET status = ?")) {
      const row = this.db.wholesaleQuotes.get(v[2]);
      if (!row || row.status !== v[3]) return { success: true, meta: { changes: 0 } };
      row.status = v[0]; row.updated_at = v[1];
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE wholesale_quotes SET status = 'declined'")) {
      const row = this.db.wholesaleQuotes.get(v[1]);
      if (!row || row.status !== "sent") return { success: true, meta: { changes: 0 } };
      row.status = "declined"; row.updated_at = v[0];
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO orders") && q.includes("source_quote_id")) {
      const [id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, customer_note, source_quote_id] = v;
      const quote = this.db.wholesaleQuotes.get(source_quote_id);
      const guardQuoteId = v[12]; const guardNow = v[13];
      if (!quote || quote.status !== "sent" || guardQuoteId !== source_quote_id || Date.parse(quote.valid_until) <= Date.parse(guardNow) || [...this.db.orders.values()].some((row) => row.source_quote_id === source_quote_id)) return { success: true, meta: { changes: 0 } };
      const checks = v.slice(14);
      for (let i = 0; i < checks.length; i += 2) { const variant = this.db.variants.get(checks[i]); if (!variant || variant.stock_on_hand - (variant.reserved_quantity ?? 0) < checks[i + 1]) return { success: true, meta: { changes: 0 } }; }
      this.db.orders.set(id, { id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, customer_note, source_quote_id, payment_method: "cod", payment_status: "pending", order_status: "pending", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE wholesale_quotes SET status = 'accepted'")) {
      const [converted_order_id, updated_at, id, orderId] = v;
      const row = this.db.wholesaleQuotes.get(id);
      if (!row || row.status !== "sent" || !this.db.orders.has(orderId)) return { success: true, meta: { changes: 0 } };
      row.status = "accepted"; row.converted_order_id = converted_order_id; row.updated_at = updated_at;
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'wholesale_quote.accepted'")) {
      this.db.audits.push(v); return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO orders")) {
      const [id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, customer_note, checkout_token] = v;
      if ([...this.db.orders.values()].some((row) => row.checkout_token === checkout_token)) return { success: true, meta: { changes: 0 } };
      const checks = v.slice(12);
      for (let i = 0; i < checks.length; i += 2) {
        const variant = this.db.variants.get(checks[i]);
        if (!variant || variant.is_active !== 1 || variant.stock_on_hand - (variant.reserved_quantity ?? 0) < checks[i + 1]) return { success: true, meta: { changes: 0 } };
      }
      this.db.orders.set(id, { id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, payment_method: "cod", payment_status: "pending", order_status: "pending", customer_note, checkout_token, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE product_variants SET reserved_quantity = reserved_quantity + ?")) {
      const row = this.db.variants.get(v[2]);
      if (!row || row.stock_on_hand - (row.reserved_quantity ?? 0) < v[3] || !this.db.orders.has(v[4])) return { success: true, meta: { changes: 0 } };
      row.reserved_quantity = (row.reserved_quantity ?? 0) + v[0];
      row.updated_at = v[1];
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO order_items")) {
      const [id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa] = v;
      if (!this.db.orders.has(order_id)) return { success: true, meta: { changes: 0 } };
      this.db.orderItems.push({ id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE orders SET order_status = ?")) {
      const [status, updated_at, id, expected] = v;
      const order = this.db.orders.get(id);
      if (!order || order.order_status !== expected) return { success: true, meta: { changes: 0 } };
      const items = this.db.orderItems.filter((item) => item.order_id === id);
      if (status === "cancelled" && items.some((item) => (this.db.variants.get(item.variant_id)?.reserved_quantity ?? 0) < item.quantity)) return { success: true, meta: { changes: 0 } };
      if (status === "dispatched" && items.some((item) => { const variant = this.db.variants.get(item.variant_id); return !variant || variant.stock_on_hand < item.quantity || (variant.reserved_quantity ?? 0) < item.quantity; })) return { success: true, meta: { changes: 0 } };
      Object.assign(order, { order_status: status, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE product_variants SET reserved_quantity = reserved_quantity - ?")) {
      const [quantity, updated_at, id, expected, orderId] = v;
      const row = this.db.variants.get(id);
      if (!row || (row.reserved_quantity ?? 0) < expected || this.db.orders.get(orderId)?.order_status !== "cancelled") return { success: true, meta: { changes: 0 } };
      row.reserved_quantity -= quantity; row.updated_at = updated_at;
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE product_variants SET stock_on_hand = stock_on_hand - ?")) {
      const [quantity, reserve, updated_at, id, stockCheck, reserveCheck, orderId] = v;
      const row = this.db.variants.get(id);
      if (!row || row.stock_on_hand < stockCheck || (row.reserved_quantity ?? 0) < reserveCheck || this.db.orders.get(orderId)?.order_status !== "dispatched") return { success: true, meta: { changes: 0 } };
      row.stock_on_hand -= quantity; row.reserved_quantity -= reserve; row.updated_at = updated_at;
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO inventory_movements") && q.includes("'sold'")) {
      const [id, variant_id, quantity_delta, reference_id, actor_admin_id] = v;
      this.db.movements.push({ id, variant_id, movement_type: "sold", quantity_delta, reference_type: "order", reference_id, note: "COD order dispatched", actor_admin_id, created_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("FROM orders")) {
      this.db.audits.push(v);
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO products")) {
      const [id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa] = v;
      this.db.products.set(id, { id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO product_variants")) {
      const [id, product_id, sku, size, color, stock_on_hand] = v;
      if (sku && [...this.db.variants.values()].some((row) => row.sku === sku)) throw new Error("UNIQUE constraint failed: product_variants.sku");
      this.db.variants.set(id, { id, product_id, sku, size, color, stock_on_hand, reserved_quantity: 0, is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE product_variants SET stock_on_hand = stock_on_hand + ?")) {
      const row = this.db.variants.get(v[2]);
      if (!row || row.is_active !== 1 || row.stock_on_hand !== v[3] || row.stock_on_hand + v[0] < 0) return { success: true, meta: { changes: 0 } };
      row.stock_on_hand += v[0];
      row.updated_at = v[1];
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE product_variants SET sku = ?")) {
      const row = this.db.variants.get(v[5]);
      if (!row) return { success: true, meta: { changes: 0 } };
      if (v[0] && [...this.db.variants.values()].some((item) => item.id !== row.id && item.sku === v[0])) throw new Error("UNIQUE constraint failed: product_variants.sku");
      Object.assign(row, { sku: v[0], size: v[1], color: v[2], is_active: v[3], updated_at: v[4] });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO inventory_movements")) {
      if (q.includes(" SELECT ")) {
        const [id, variant_id, movement_type, quantity_delta, reference_type, reference_id, note, actor_admin_id, expectedId, expectedStock] = v;
        const variant = this.db.variants.get(expectedId);
        if (!variant || variant.stock_on_hand !== expectedStock) return { success: true, meta: { changes: 0 } };
        this.db.movements.push({ id, variant_id, movement_type, quantity_delta, reference_type, reference_id, note, actor_admin_id, created_at: new Date().toISOString() });
      } else if (q.includes("'opening'")) {
        const [id, variant_id, quantity_delta, note, actor_admin_id] = v;
        this.db.movements.push({ id, variant_id, movement_type: "opening", quantity_delta, reference_type: "manual", reference_id: null, note, actor_admin_id, created_at: new Date().toISOString() });
      } else {
        const [id, variant_id, movement_type, quantity_delta, reference_type, note, actor_admin_id] = v;
        this.db.movements.push({ id, variant_id, movement_type, quantity_delta, reference_type, reference_id: null, note, actor_admin_id, created_at: new Date().toISOString() });
      }
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes(" SELECT ")) {
      const [id, actor, action, entity, entityId, metadata, movementId] = v;
      if (!this.db.movements.some((row) => row.id === movementId)) return { success: true, meta: { changes: 0 } };
      this.db.audits.push([id, actor, action, entity, entityId, metadata]);
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE enquiries SET status = ?")) {
      const row = this.db.enquiries.get(v[1]);
      if (row) row.status = v[0];
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("UPDATE products SET slug")) {
      const [slug, name, description, category, audience, status, retail, wholesale, updated, id] = v;
      const row = this.db.products.get(id);
      if (row) Object.assign(row, { slug, name, description, category, audience, status, retail_price_paisa: retail, wholesale_price_paisa: wholesale, updated_at: updated });
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("UPDATE products SET status = 'archived'")) {
      const row = this.db.products.get(v[1]);
      if (row) Object.assign(row, { status: "archived", updated_at: v[0] });
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("INSERT INTO audit_logs")) {
      this.db.audits.push(v);
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO admin_users")) {
      if (this.db.admins.size) return { success: true, meta: { changes: 0 } };
      const row = { id: v[0], email: v[1], password_hash: v[2], role: "owner", is_active: 1, last_login_at: null };
      this.db.admins.set(row.id, row);
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO admin_sessions")) {
      this.db.sessions.set(v[0], { id: v[0], admin_user_id: v[1], token_hash: v[2], expires_at: v[3], revoked_at: null });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO admin_login_attempts")) {
      const [key, now] = v;
      const existing = this.db.attempts.get(key);
      const windowExpired = existing && Date.parse(existing.window_started_at) <= Date.parse(now) - 15 * 60 * 1000;
      const count = windowExpired ? 1 : (existing?.failure_count ?? 0) + 1;
      this.db.attempts.set(key, {
        failure_count: count,
        window_started_at: windowExpired || !existing ? now : existing.window_started_at,
        locked_until: count >= 5 ? new Date(Date.parse(now) + 15 * 60 * 1000).toISOString() : existing?.locked_until ?? null,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("DELETE FROM admin_login_attempts")) {
      this.db.attempts.delete(v[0]);
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE admin_users SET last_login_at")) {
      const row = this.db.admins.get(v[1]);
      if (row) row.last_login_at = v[0];
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("UPDATE admin_sessions SET revoked_at")) {
      let changes = 0;
      for (const row of this.db.sessions.values()) if (row.token_hash === v[1] && !row.revoked_at) { row.revoked_at = v[0]; changes += 1; }
      return { success: true, meta: { changes } };
    }
    throw new Error("Unexpected run query: " + q);
  }
}

class FakeD1 {
  admins = new Map();
  sessions = new Map();
  attempts = new Map();
  products = new Map();
  variants = new Map();
  movements = [];
  enquiries = new Map();
  orders = new Map();
  orderItems = [];
  wholesaleQuotes = new Map();
  wholesaleQuoteItems = [];
  audits = [];
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

const env = (db, token = "test-bootstrap-token-with-more-than-32-characters") => ({ DB: db, ADMIN_BOOTSTRAP_TOKEN: token });
const origin = "https://deverve.example";
const request = (path, method, body, headers = {}) => new Request(origin + path, {
  method,
  headers: { origin, "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const bootstrap = (db, overrides = {}) => handleRequest(request("/api/admin/bootstrap", "POST", {
  bootstrapToken: "test-bootstrap-token-with-more-than-32-characters",
  email: "owner@deverve.example",
  password: "A-strong-password-2026",
  ...overrides,
}), env(db));
const login = (db, password) => handleRequest(request("/api/admin/login", "POST", {
  email: "owner@deverve.example", password,
}, { "cf-connecting-ip": "203.0.113.10", "sec-fetch-site": "same-origin" }), env(db));

test("bootstrap creates exactly one owner and stores only a hashed session token", async () => {
  const db = new FakeD1();
  const response = await bootstrap(db);
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(db.admins.size, 1);
  assert.equal(db.sessions.size, 1);
  assert.ok(![...db.sessions.values()][0].token_hash.includes(cookie.split("=")[1].split(";")[0]));
  assert.ok(![...db.admins.values()][0].password_hash.includes("A-strong-password-2026"));
  const second = await bootstrap(db, { email: "another@deverve.example" });
  assert.equal(second.status, 409);
  assert.equal(db.admins.size, 1);
});

test("bootstrap rejects cross-origin requests and missing server configuration", async () => {
  const db = new FakeD1();
  const crossOrigin = new Request(origin + "/api/admin/bootstrap", {
    method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ bootstrapToken: "test-bootstrap-token-with-more-than-32-characters", email: "owner@deverve.example", password: "A-strong-password-2026" }),
  });
  assert.equal((await handleRequest(crossOrigin, env(db))).status, 403);
  assert.equal((await handleRequest(request("/api/admin/bootstrap", "POST", {}), { DB: db })).status, 503);
});

test("login, current-session lookup and logout use a revocable server-side session", async () => {
  const db = new FakeD1();
  await bootstrap(db);
  const signedIn = await login(db, "A-strong-password-2026");
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get("set-cookie").split(";")[0];
  const me = await handleRequest(new Request(origin + "/api/admin/me", { headers: { cookie } }), env(db));
  assert.equal(me.status, 200);
  assert.equal((await me.json()).admin.role, "owner");
  const loggedOut = await handleRequest(request("/api/admin/logout", "POST", {}, { cookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(loggedOut.status, 200);
  const afterLogout = await handleRequest(new Request(origin + "/api/admin/me", { headers: { cookie } }), env(db));
  assert.equal(afterLogout.status, 401);
});

test("five incorrect passwords trigger a fifteen-minute login lockout", async () => {
  const db = new FakeD1();
  await bootstrap(db);
  for (let attempt = 0; attempt < 4; attempt += 1) assert.equal((await login(db, "incorrect-password")).status, 401);
  assert.equal((await login(db, "incorrect-password")).status, 429);
  assert.equal((await login(db, "A-strong-password-2026")).status, 429);
});

test("owner can create, edit, publish and archive products with an audit entry", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const created = await handleRequest(request("/api/admin/products", "POST", {
    name: "Everyday Hoodie", category: "hoodies", audience: "unisex", retail_price_paisa: 250000,
  }, headers), env(db));
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  const id = createdBody.id;
  assert.equal(createdBody.product.slug, "everyday-hoodie");
  assert.equal(db.audits.length, 1);

  const updated = await handleRequest(request("/api/admin/products/" + id, "PATCH", {
    name: "Everyday Premium Hoodie", status: "published",
  }, headers), env(db));
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).product.status, "published");

  const listed = await handleRequest(new Request(origin + "/api/admin/products?status=published", { headers: { cookie } }), env(db));
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).products.length, 1);

  const archived = await handleRequest(request("/api/admin/products/" + id, "DELETE", {}, headers), env(db));
  assert.equal(archived.status, 200);
  assert.equal(db.products.get(id).status, "archived");
  assert.equal(db.audits.length, 3);
});

test("catalogue staff cannot publish or archive products", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const created = await handleRequest(request("/api/admin/products", "POST", {
    name: "Staff Draft Hoodie", category: "hoodies", audience: "unisex",
  }, headers), env(db));
  assert.equal(created.status, 201);
  const id = (await created.json()).id;
  const admin = [...db.admins.values()][0];
  admin.role = "catalogue";

  const publish = await handleRequest(request("/api/admin/products/" + id, "PATCH", { status: "published" }, headers), env(db));
  assert.equal(publish.status, 403);
  const archive = await handleRequest(request("/api/admin/products/" + id, "DELETE", {}, headers), env(db));
  assert.equal(archive.status, 403);
  assert.equal(db.products.get(id).status, "draft");
});

test("duplicate product slugs are rejected without a second insert", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const payload = { name: "Classic Sweatshirt", category: "sweatshirts", audience: "unisex" };
  assert.equal((await handleRequest(request("/api/admin/products", "POST", payload, headers), env(db))).status, 201);
  const duplicate = await handleRequest(request("/api/admin/products", "POST", payload, headers), env(db));
  assert.equal(duplicate.status, 409);
  assert.equal(db.products.size, 1);
});

test("owner can review enquiries and change status with an audit trail", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const enquiry = {
    id: "e2f4a6b8-1234-4abc-9def-123456789abc",
    enquiry_type: "wholesale", customer_name: "Test Buyer", phone: "+923001234567",
    email: "buyer@example.com", message: "Please share your wholesale rates.",
    status: "new", source: "website", created_at: new Date().toISOString(),
  };
  db.enquiries.set(enquiry.id, { ...enquiry });

  const listed = await handleRequest(new Request(origin + "/api/admin/enquiries?limit=50", { headers: { cookie } }), env(db));
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).enquiries[0].customer_name, "Test Buyer");

  const updated = await handleRequest(request("/api/admin/enquiries/" + enquiry.id, "PATCH", { status: "contacted" }, headers), env(db));
  assert.equal(updated.status, 200);
  assert.equal(db.enquiries.get(enquiry.id).status, "contacted");
  assert.equal(db.audits.length, 1);
});

test("rental staff can only update rental enquiries and viewers cannot update enquiries", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const id = "a2f4a6b8-1234-4abc-9def-123456789abc";
  db.enquiries.set(id, { id, enquiry_type: "wholesale", status: "new" });
  const rentalId = "b2f4a6b8-1234-4abc-9def-123456789abc";
  db.enquiries.set(rentalId, { id: rentalId, enquiry_type: "rental", status: "new" });
  [...db.admins.values()][0].role = "rental";

  const rentalList = await handleRequest(new Request(origin + "/api/admin/enquiries", { headers: { cookie } }), env(db));
  assert.equal(rentalList.status, 200);
  assert.deepEqual((await rentalList.json()).enquiries.map((item) => item.id), [rentalId]);

  const blocked = await handleRequest(request("/api/admin/enquiries/" + id, "PATCH", { status: "contacted" }, headers), env(db));
  assert.equal(blocked.status, 403);
  [...db.admins.values()][0].role = "viewer";
  const viewer = await handleRequest(request("/api/admin/enquiries/" + id, "PATCH", { status: "closed" }, headers), env(db));
  assert.equal(viewer.status, 403);
});

test("owner can create variants and record stock movements without allowing negative inventory", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const productResponse = await handleRequest(request("/api/admin/products", "POST", {
    name: "Stretch Hoodie", category: "hoodies", audience: "unisex",
  }, headers), env(db));
  const productId = (await productResponse.json()).id;

  const created = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", {
    sku: "dv-hood-blk-m", size: "M", color: "Black", initial_stock: 10,
  }, headers), env(db));
  assert.equal(created.status, 201);
  const variant = (await created.json()).variant;
  assert.equal(variant.sku, "DV-HOOD-BLK-M");
  assert.equal(db.variants.get(variant.id).stock_on_hand, 10);
  assert.equal(db.movements[0].movement_type, "opening");

  const received = await handleRequest(request("/api/admin/variants/" + variant.id + "/stock", "POST", {
    movement_type: "received", quantity_delta: 5, note: "Supplier delivery",
  }, headers), env(db));
  assert.equal(received.status, 200);
  assert.equal((await received.json()).stock_on_hand, 15);

  const adjustment = await handleRequest(request("/api/admin/variants/" + variant.id + "/stock", "POST", {
    movement_type: "adjustment", quantity_delta: -3, note: "Damaged items removed",
  }, headers), env(db));
  assert.equal(adjustment.status, 200);
  assert.equal((await adjustment.json()).stock_on_hand, 12);

  const negative = await handleRequest(request("/api/admin/variants/" + variant.id + "/stock", "POST", {
    movement_type: "adjustment", quantity_delta: -20, note: "Invalid count",
  }, headers), env(db));
  assert.equal(negative.status, 409);
  assert.equal(db.variants.get(variant.id).stock_on_hand, 12);
  assert.equal(db.movements.length, 3);
  const history = await handleRequest(new Request(origin + "/api/admin/variants/" + variant.id + "/movements", { headers: { cookie } }), env(db));
  assert.equal(history.status, 200);
  assert.equal((await history.json()).movements.length, 3);
});

test("catalogue staff cannot change stock quantities", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const product = await handleRequest(request("/api/admin/products", "POST", { name: "Basic Tee", category: "t-shirts", audience: "unisex" }, headers), env(db));
  const productId = (await product.json()).id;
  const created = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", { size: "L", color: "White" }, headers), env(db));
  const variantId = (await created.json()).variant.id;
  [...db.admins.values()][0].role = "catalogue";
  const denied = await handleRequest(request("/api/admin/variants/" + variantId + "/stock", "POST", { movement_type: "received", quantity_delta: 3, note: "Supplier delivery" }, headers), env(db));
  assert.equal(denied.status, 403);
  assert.equal(db.variants.get(variantId).stock_on_hand, 0);
});


test("COD checkout verifies live price, reserves stock once, and fulfils orders through the admin workflow", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const productResponse = await handleRequest(request("/api/admin/products", "POST", {
    name: "Checkout Hoodie", category: "hoodies", audience: "unisex", retail_price_paisa: 250000,
  }, headers), env(db));
  const productId = (await productResponse.json()).id;
  await handleRequest(request("/api/admin/products/" + productId, "PATCH", { status: "published" }, headers), env(db));
  const variantResponse = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", {
    sku: "DV-CHECKOUT-M", size: "M", color: "Navy", initial_stock: 5,
  }, headers), env(db));
  const variantId = (await variantResponse.json()).variant.id;

  const catalogue = await handleRequest(new Request(origin + "/api/products?limit=12"), env(db));
  assert.equal(catalogue.status, 200);
  assert.equal((await catalogue.json()).products[0].variants[0].available_quantity, 5);

  const payload = {
    checkout_token: "123e4567-e89b-42d3-a456-426614174000",
    customer_name: "Test Buyer", phone: "+923001234567", email: "buyer@example.com",
    delivery_address: "House 10, Street 2, Model Town", city: "Jhelum", customer_note: "",
    items: [{ variant_id: variantId, quantity: 2 }],
  };
  const placed = await handleRequest(request("/api/orders", "POST", payload), env(db));
  assert.equal(placed.status, 201);
  const placedBody = await placed.json();
  assert.match(placedBody.order_number, /^DV-/);
  assert.equal(placedBody.total_paisa, 500000);
  assert.equal(db.variants.get(variantId).stock_on_hand, 5);
  assert.equal(db.variants.get(variantId).reserved_quantity, 2);
  assert.equal(db.orders.size, 1);

  const duplicate = await handleRequest(request("/api/orders", "POST", payload), env(db));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(db.orders.size, 1);
  assert.equal(db.variants.get(variantId).reserved_quantity, 2);

  const unavailable = await handleRequest(request("/api/orders", "POST", {
    ...payload, checkout_token: "123e4567-e89b-42d3-a456-426614174001", items: [{ variant_id: variantId, quantity: 10 }],
  }), env(db));
  assert.equal(unavailable.status, 409);
  assert.equal(db.orders.size, 1);

  const listed = await handleRequest(new Request(origin + "/api/admin/orders", { headers: { cookie } }), env(db));
  assert.equal(listed.status, 200);
  const order = (await listed.json()).orders[0];
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].quantity, 2);

  for (const status of ["confirmed", "processing", "dispatched", "delivered"]) {
    const updated = await handleRequest(request("/api/admin/orders/" + order.id, "PATCH", { order_status: status }, headers), env(db));
    assert.equal(updated.status, 200);
  }
  assert.equal(db.variants.get(variantId).stock_on_hand, 3);
  assert.equal(db.variants.get(variantId).reserved_quantity, 0);
  assert.equal(db.movements.at(-1).movement_type, "sold");
  assert.equal(db.movements.at(-1).quantity_delta, -2);
});

test("cancelling a COD order releases its reservation without changing physical stock", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const product = await handleRequest(request("/api/admin/products", "POST", {
    name: "Cancel Test Tee", category: "t-shirts", audience: "unisex", retail_price_paisa: 120000,
  }, headers), env(db));
  const productId = (await product.json()).id;
  await handleRequest(request("/api/admin/products/" + productId, "PATCH", { status: "published" }, headers), env(db));
  const variant = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", {
    sku: "DV-CANCEL-L", size: "L", color: "White", initial_stock: 4,
  }, headers), env(db));
  const variantId = (await variant.json()).variant.id;
  const placed = await handleRequest(request("/api/orders", "POST", {
    checkout_token: "123e4567-e89b-42d3-a456-426614174002",
    customer_name: "Cancel Buyer", phone: "+923001234567", delivery_address: "House 10, Street 2", city: "Jhelum",
    items: [{ variant_id: variantId, quantity: 3 }],
  }), env(db));
  assert.equal(placed.status, 201);
  const orderId = [...db.orders.keys()][0];
  const cancelled = await handleRequest(request("/api/admin/orders/" + orderId, "PATCH", { order_status: "cancelled" }, headers), env(db));
  assert.equal(cancelled.status, 200);
  assert.equal(db.variants.get(variantId).stock_on_hand, 4);
  assert.equal(db.variants.get(variantId).reserved_quantity, 0);
});

test("wholesale quotation can be sent, customer-approved and converted once into a stock-reserved COD order", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const productResponse = await handleRequest(request("/api/admin/products", "POST", {
    name: "Wholesale Hoodie", category: "hoodies", audience: "unisex", status: "published",
    retail_price_paisa: 300000, wholesale_price_paisa: 200000,
  }, headers), env(db));
  const productId = (await productResponse.json()).id;
  await handleRequest(request("/api/admin/products/" + productId, "PATCH", { status: "published" }, headers), env(db));
  const variantResponse = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", {
    sku: "DV-WHOLESALE-M", size: "M", color: "Navy", initial_stock: 30,
  }, headers), env(db));
  const variantId = (await variantResponse.json()).variant.id;
  const created = await handleRequest(request("/api/admin/wholesale-quotes", "POST", {
    business_name: "Test Retail Store", contact_name: "Wholesale Buyer", phone: "+923001234567",
    email: "buyer@example.com", delivery_address: "Shop 12, Main Market", city: "Jhelum",
    valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
    items: [{ variant_id: variantId, quantity: 12, unit_price_paisa: 185000 }],
  }, headers), env(db));
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  const quoteId = createdBody.quote_id;
  const quote = db.wholesaleQuotes.get(quoteId);
  assert.equal(quote.quoted_total_paisa, 2220000);
  assert.equal(quote.status, "prepared");
  assert.equal(db.wholesaleQuoteItems.length, 1);
  const sent = await handleRequest(request("/api/admin/wholesale-quotes/" + quoteId, "PATCH", { status: "sent" }, headers), env(db));
  assert.equal(sent.status, 200);
  const publicUrl = "/api/wholesale-quotes/" + quote.approval_token;
  const view = await handleRequest(new Request(origin + publicUrl), env(db));
  assert.equal(view.status, 200);
  assert.equal((await view.json()).quote.items[0].quantity, 12);
  assert.equal(db.variants.get(variantId).reserved_quantity, 0);
  const accepted = await handleRequest(request(publicUrl + "/accept", "POST", {}, { "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(accepted.status, 201);
  const acceptedBody = await accepted.json();
  assert.match(acceptedBody.order.order_number, /^DV-W-/);
  assert.equal(db.orders.size, 1);
  assert.equal(db.wholesaleQuotes.get(quoteId).status, "accepted");
  assert.equal(db.variants.get(variantId).reserved_quantity, 12);
  const order = [...db.orders.values()][0];
  assert.equal(order.phone, "+923001234567");
  assert.equal(order.delivery_address, "Shop 12, Main Market");
  assert.equal(order.total_paisa, 2220000);
  const duplicate = await handleRequest(request(publicUrl + "/accept", "POST", {}, { "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).accepted, true);
  assert.equal(db.orders.size, 1);
  assert.equal(db.variants.get(variantId).reserved_quantity, 12);
});
