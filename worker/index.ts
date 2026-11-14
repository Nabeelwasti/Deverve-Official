interface R2ObjectBody { body: ReadableStream<Uint8Array>; size: number; }
interface R2Bucket { put(key: string, value: ArrayBuffer | ReadableStream | string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string,string> }): Promise<unknown>; get(key: string): Promise<R2ObjectBody | null>; delete(key: string): Promise<void>; }
interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: { changes?: number };
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ADMIN_BOOTSTRAP_TOKEN?: string;
}
interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  audience: string;
  retail_price_paisa: number | null;
  image_key: string | null;
}
interface AdminRow {
  id: string;
  email: string;
  role: string;
  is_active: number;
  password_hash: string;
}
interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  audience: string;
  status: "draft" | "published" | "archived";
  retail_price_paisa: number | null;
  wholesale_price_paisa: number | null;
  updated_at: string;
  image_key: string | null;
}
interface SessionRow {
  id: string;
  admin_user_id: string;
  email: string;
  role: string;
  is_active: number;
  expires_at: string;
  revoked_at: string | null;
}

const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...extraHeaders,
    },
  });

const error = (message: string, status: number): Response => json({ error: message }, status);

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validPhone(value: string): boolean {
  return /^\+?[0-9 ()-]{8,20}$/.test(value);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function passwordHash(password: string): Promise<string> {
  // Cloudflare Workers currently rejects PBKDF2 calls above 100,000 iterations.
  // Keep the verifier's accepted minimum aligned with this platform maximum.
  const iterations = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${base64Url(salt)}$${base64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationText, saltText, expectedText] = stored.split("$");
  const iterations = Number(iterationText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !saltText || !expectedText) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(saltText), iterations }, key, 256);
    const actual = new Uint8Array(bits);
    const expected = fromBase64Url(expectedText);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

async function constantTimeTextEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)), crypto.subtle.digest("SHA-256", new TextEncoder().encode(right))]);
  const first = new Uint8Array(a);
  const second = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first[index] ^ second[index];
  return difference === 0;
}

function requireSameOrigin(request: Request, url: URL): boolean {
  return request.headers.get("origin") === url.origin && request.headers.get("sec-fetch-site") !== "cross-site";
}

function cookieValue(request: Request, name: string): string {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function sessionCookie(token: string, maxAge: number): string {
  return `__Host-deverve_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function createSession(db: D1Database, adminId: string): Promise<{ token: string; expiresAt: string }> {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO admin_sessions (id, admin_user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), adminId, await sha256(token), expiresAt).run();
  return { token, expiresAt };
}

async function currentAdmin(request: Request, db: D1Database): Promise<SessionRow | null> {
  const token = cookieValue(request, "__Host-deverve_admin");
  if (!token || token.length > 100) return null;
  return db.prepare(
    "SELECT s.id, s.admin_user_id, u.email, u.role, u.is_active, s.expires_at, s.revoked_at FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_user_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.is_active = 1 LIMIT 1",
  ).bind(await sha256(token), new Date().toISOString()).first<SessionRow>();
}

async function readJson(request: Request, maxBytes = 8_000): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}


interface NormalizedProduct {
  slug: string;
  name: string;
  description: string;
  category: string;
  audience: "men" | "women" | "kids" | "unisex";
  status: "draft" | "published" | "archived";
  retailPrice: number | null;
  wholesalePrice: number | null;
}

function normalizeProduct(body: Record<string, unknown>, current?: AdminProductRow): NormalizedProduct | null {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  const name = has("name") ? cleanText(body.name, 120) : current?.name ?? "";
  const description = has("description") ? cleanText(body.description, 4000) : current?.description ?? "";
  const category = has("category") ? cleanText(body.category, 60) : current?.category ?? "";
  const audience = has("audience") ? cleanText(body.audience, 12) : current?.audience ?? "";
  const status = has("status") ? cleanText(body.status, 12) : current?.status ?? "draft";
  const rawSlug = has("slug") ? cleanText(body.slug, 120) : current?.slug ?? name;
  const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
  const price = (key: string, existing: number | null | undefined): number | null | undefined => {
    if (!has(key)) return existing ?? null;
    const value = body[key];
    if (value === null || value === "") return null;
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  };
  const retailPrice = price("retail_price_paisa", current?.retail_price_paisa);
  const wholesalePrice = price("wholesale_price_paisa", current?.wholesale_price_paisa);
  if (name.length < 2 || category.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  if (!["men", "women", "kids", "unisex"].includes(audience)) return null;
  if (!["draft", "published", "archived"].includes(status)) return null;
  if (retailPrice === undefined || wholesalePrice === undefined) return null;
  return {
    slug, name, description, category,
    audience: audience as NormalizedProduct["audience"],
    status: status as NormalizedProduct["status"],
    retailPrice, wholesalePrice,
  };
}

async function adminProductRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const isCollection = path === "/api/admin/products";
  const productId = path.startsWith("/api/admin/products/") ? path.slice("/api/admin/products/".length) : "";
  const productMatch = /^[a-f0-9-]{36}$/i.test(productId) ? productId : null;
  const isOverview = path === "/api/admin/overview";
  if (!isCollection && !productMatch && !isOverview) return null;

  let admin: SessionRow | null;
  try {
    admin = await currentAdmin(request, env.DB);
  } catch {
    return error("Admin service is temporarily unavailable", 503);
  }
  if (!admin) return error("Authentication required", 401);

  if (isOverview && request.method === "GET") {
    try {
      const stats = await env.DB.prepare(
        "SELECT (SELECT COUNT(*) FROM products WHERE status = 'published') AS published_products, (SELECT COUNT(*) FROM products WHERE status = 'draft') AS draft_products, (SELECT COUNT(*) FROM enquiries WHERE status = 'new') AS new_enquiries, (SELECT COUNT(*) FROM orders WHERE order_status = 'pending') AS pending_orders, (SELECT COUNT(*) FROM rental_requests WHERE status = 'requested') AS rental_requests",
      ).first<Record<string, number>>();
      return json({ overview: stats ?? { published_products: 0, draft_products: 0, new_enquiries: 0, pending_orders: 0, rental_requests: 0 } });
    } catch {
      return error("Dashboard summary is temporarily unavailable", 503);
    }
  }

  if (isCollection && request.method === "GET") {
    try {
      const limitValue = Number(url.searchParams.get("limit") ?? "50");
      const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50;
      const status = cleanText(url.searchParams.get("status"), 12);
      const rows = status && ["draft", "published", "archived"].includes(status)
        ? await env.DB.prepare("SELECT id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, updated_at, image_key FROM products WHERE status = ? ORDER BY updated_at DESC LIMIT ?").bind(status, limit).all<AdminProductRow>()
        : await env.DB.prepare("SELECT id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, updated_at, image_key FROM products ORDER BY updated_at DESC LIMIT ?").bind(limit).all<AdminProductRow>();
      return json({ products: rows.results ?? [] });
    } catch {
      return error("Product management is temporarily unavailable", 503);
    }
  }

  const canManage = ["owner", "manager", "catalogue"].includes(admin.role);
  if (!canManage) return error("You do not have permission to manage products", 403);
  if (!["POST", "PATCH", "DELETE"].includes(request.method)) return error("Method not allowed", 405);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);

  if (isCollection && request.method === "POST") {
    const body = await readJson(request);
    if (!body) return error("Please submit valid product details", 400);
    const product = normalizeProduct(body);
    if (!product) return error("Check the product name, slug, category, audience, status and prices", 400);
    if (admin.role === "catalogue" && product.status !== "draft") return error("Only an owner or manager can publish products", 403);
    try {
      const duplicate = await env.DB.prepare("SELECT id FROM products WHERE slug = ? LIMIT 1").bind(product.slug).first<{ id: string }>();
      if (duplicate) return error("A product with this URL slug already exists", 409);
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO products (id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(id, product.slug, product.name, product.description, product.category, product.audience, product.status, product.retailPrice, product.wholesalePrice),
        env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), admin.admin_user_id, "product.created", "product", id, JSON.stringify({ status: product.status, category: product.category })),
      ]);
      return json({ created: true, id, product }, 201);
    } catch {
      return error("Product could not be created", 503);
    }
  }

  if (productMatch && request.method === "PATCH") {
    const id = productMatch;
    const body = await readJson(request);
    if (!body) return error("Please submit valid product details", 400);
    try {
      const current = await env.DB.prepare("SELECT id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, updated_at FROM products WHERE id = ? LIMIT 1")
        .bind(id).first<AdminProductRow>();
      if (!current) return error("Product not found", 404);
      const product = normalizeProduct(body, current);
      if (!product) return error("Check the product name, slug, category, audience, status and prices", 400);
      if (admin.role === "catalogue" && product.status !== "draft" && product.status !== current.status) return error("Only an owner or manager can change publication status", 403);
      const duplicate = await env.DB.prepare("SELECT id FROM products WHERE slug = ? AND id <> ? LIMIT 1").bind(product.slug, id).first<{ id: string }>();
      if (duplicate) return error("A product with this URL slug already exists", 409);
      await env.DB.batch([
        env.DB.prepare("UPDATE products SET slug = ?, name = ?, description = ?, category = ?, audience = ?, status = ?, retail_price_paisa = ?, wholesale_price_paisa = ?, updated_at = ? WHERE id = ?")
          .bind(product.slug, product.name, product.description, product.category, product.audience, product.status, product.retailPrice, product.wholesalePrice, new Date().toISOString(), id),
        env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), admin.admin_user_id, "product.updated", "product", id, JSON.stringify({ status: product.status, category: product.category })),
      ]);
      return json({ updated: true, id, product });
    } catch {
      return error("Product could not be updated", 503);
    }
  }

  if (productMatch && request.method === "DELETE") {
    if (!["owner", "manager"].includes(admin.role)) return error("Only an owner or manager can archive products", 403);
    const id = productMatch;
    try {
      const current = await env.DB.prepare("SELECT id FROM products WHERE id = ? LIMIT 1").bind(id).first<{ id: string }>();
      if (!current) return error("Product not found", 404);
      await env.DB.batch([
        env.DB.prepare("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id),
        env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), admin.admin_user_id, "product.archived", "product", id, "{}"),
      ]);
      return json({ archived: true, id });
    } catch {
      return error("Product could not be archived", 503);
    }
  }
  return error("Method not allowed", 405);
}


interface CheckoutVariantRow {
  id: string; product_id: string; name: string; sku: string | null; size: string; color: string;
  retail_price_paisa: number | null; stock_on_hand: number; reserved_quantity: number;
}
interface OrderRow {
  id: string; order_number: string; customer_name: string; phone: string; email: string | null;
  delivery_address: string; city: string; subtotal_paisa: number; delivery_fee_paisa: number;
  total_paisa: number; payment_method: string; payment_status: string; order_status: string;
  customer_note: string; created_at: string; updated_at: string;
}
interface OrderItemRow {
  id: string; order_id: string; variant_id: string | null; product_name_snapshot: string;
  sku_snapshot: string | null; size_snapshot: string; color_snapshot: string;
  quantity: number; unit_price_paisa: number; line_total_paisa: number;
}

async function publicOrderRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/orders" || request.method !== "POST") return null;
  const body = await readJson(request, 12_000);
  if (!body) return error("Please submit valid checkout details", 400);
  if (cleanText(body.website, 120)) return json({ accepted: true });
  const token = cleanText(body.checkout_token, 64);
  if (!/^[a-f0-9-]{36}$/i.test(token)) return error("Refresh checkout and try again", 400);
  try {
    const existing = await env.DB.prepare("SELECT order_number, total_paisa, order_status FROM orders WHERE checkout_token = ? LIMIT 1")
      .bind(token).first<{ order_number: string; total_paisa: number; order_status: string }>();
    if (existing) return json({ accepted: true, duplicate: true, ...existing });
  } catch { return error("Checkout is temporarily unavailable", 503); }

  const customerName = cleanText(body.customer_name, 100);
  const phone = cleanText(body.phone, 24);
  const email = cleanText(body.email, 160).toLowerCase();
  const address = cleanText(body.delivery_address, 300);
  const city = cleanText(body.city, 80);
  const note = cleanText(body.customer_note, 500);
  if (customerName.length < 2 || !validPhone(phone) || address.length < 8 || city.length < 2) {
    return error("Please check your name, phone number, delivery address and city", 400);
  }
  if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return error("Please enter a valid email address", 400);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return error("Your cart must contain between 1 and 20 items", 400);

  const quantities = new Map<string, number>();
  for (const item of body.items) {
    if (!item || typeof item !== "object") return error("Your cart contains an invalid item", 400);
    const variantId = cleanText((item as Record<string, unknown>).variant_id, 64);
    const quantity = (item as Record<string, unknown>).quantity;
    if (!/^[a-f0-9-]{36}$/i.test(variantId) || !Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 10) {
      return error("Check the selected product options and quantities", 400);
    }
    quantities.set(variantId, (quantities.get(variantId) ?? 0) + Number(quantity));
  }
  if (quantities.size > 20 || [...quantities.values()].some((quantity) => quantity > 10)) return error("Each product option is limited to 10 pieces per order", 400);

  const lines: Array<{ variant: CheckoutVariantRow; quantity: number; lineTotal: number }> = [];
  let subtotal = 0;
  try {
    for (const [variantId, quantity] of quantities) {
      const variant = await env.DB.prepare(
        "SELECT v.id, v.product_id, v.sku, v.size, v.color, v.stock_on_hand, v.reserved_quantity, p.name, p.retail_price_paisa FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.is_active = 1 AND p.status = 'published' LIMIT 1",
      ).bind(variantId).first<CheckoutVariantRow>();
      if (!variant || variant.retail_price_paisa === null || !Number.isSafeInteger(variant.retail_price_paisa) || variant.retail_price_paisa < 0) {
        return error("A product in your cart is no longer available for online checkout", 409);
      }
      if (variant.stock_on_hand - variant.reserved_quantity < quantity) return error("A selected size or colour no longer has enough stock. Please update your cart.", 409);
      const lineTotal = variant.retail_price_paisa * quantity;
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotal + lineTotal)) return error("Order total is outside the supported range", 400);
      subtotal += lineTotal;
      lines.push({ variant, quantity, lineTotal });
    }
    const deliveryFee = 0;
    const total = subtotal + deliveryFee;
    const id = crypto.randomUUID();
    const randomPart = base64Url(crypto.getRandomValues(new Uint8Array(5))).toUpperCase().replace(/[-_]/g, "").slice(0, 7);
    const orderNumber = "DV-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + randomPart;
    const now = new Date().toISOString();
    const conditions = lines.map(() => "EXISTS (SELECT 1 FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.is_active = 1 AND p.status = 'published' AND v.stock_on_hand - v.reserved_quantity >= ?)").join(" AND ");
    const orderValues: unknown[] = [id, orderNumber, customerName, phone, email || null, address, city, subtotal, deliveryFee, total, note, token];
    for (const line of lines) orderValues.push(line.variant.id, line.quantity);
    const statements = [
      env.DB.prepare("INSERT INTO orders (id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, customer_note, checkout_token) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE " + conditions).bind(...orderValues),
    ];
    for (const line of lines) {
      statements.push(env.DB.prepare("UPDATE product_variants SET reserved_quantity = reserved_quantity + ?, updated_at = ? WHERE id = ? AND is_active = 1 AND stock_on_hand - reserved_quantity >= ? AND EXISTS (SELECT 1 FROM orders WHERE id = ?)")
        .bind(line.quantity, now, line.variant.id, line.quantity, id));
      statements.push(env.DB.prepare("INSERT INTO order_items (id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?)")
        .bind(crypto.randomUUID(), id, line.variant.id, line.variant.name, line.variant.sku, line.variant.size, line.variant.color, line.quantity, line.variant.retail_price_paisa, line.lineTotal, id));
    }
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta?.changes ?? 0) !== 1) return error("Stock changed while you were checking out. Please review your cart and try again.", 409);
    return json({ accepted: true, order_number: orderNumber, subtotal_paisa: subtotal, delivery_fee_paisa: deliveryFee, total_paisa: total, order_status: "pending" }, 201);
  } catch {
    try {
      const existing = await env.DB.prepare("SELECT order_number, total_paisa, order_status FROM orders WHERE checkout_token = ? LIMIT 1")
        .bind(token).first<{ order_number: string; total_paisa: number; order_status: string }>();
      if (existing) return json({ accepted: true, duplicate: true, ...existing });
    } catch { /* report the original safe error */ }
    return error("Your order could not be placed. Please try again or contact us on WhatsApp.", 503);
  }
}

async function adminOrderRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const collection = url.pathname === "/api/admin/orders";
  const match = url.pathname.match(/^\\/api\\/admin\\/orders\\/([a-f0-9-]{36})$/i);
  if (!collection && !match) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Order management is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "orders"].includes(admin.role)) return error("You do not have permission to manage orders", 403);

  if (collection && request.method === "GET") {
    const limitValue = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50;
    try {
      const result = await env.DB.prepare("SELECT id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, payment_method, payment_status, order_status, customer_note, created_at, updated_at FROM orders ORDER BY created_at DESC LIMIT ?")
        .bind(limit).all<OrderRow>();
      const orders = result.results ?? [];
      if (!orders.length) return json({ orders: [] });
      const ids = orders.map((order) => order.id);
      const placeholders = ids.map(() => "?").join(",");
      const itemResult = await env.DB.prepare("SELECT id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM order_items WHERE order_id IN (" + placeholders + ") ORDER BY rowid").bind(...ids).all<OrderItemRow>();
      const grouped = new Map<string, OrderItemRow[]>();
      for (const item of itemResult.results ?? []) grouped.set(item.order_id, [...(grouped.get(item.order_id) ?? []), item]);
      return json({ orders: orders.map((order) => ({ ...order, items: grouped.get(order.id) ?? [] })) });
    } catch { return error("Orders could not be loaded", 503); }
  }

  if (!match || request.method !== "PATCH") return error("Method not allowed", 405);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  const body = await readJson(request);
  const nextStatus = cleanText(body?.order_status, 20);
  if (!["confirmed", "processing", "dispatched", "delivered", "cancelled"].includes(nextStatus)) return error("Choose a valid order status", 400);
  const id = match[1];
  try {
    const current = await env.DB.prepare("SELECT id, order_status FROM orders WHERE id = ? LIMIT 1").bind(id).first<{ id: string; order_status: string }>();
    if (!current) return error("Order not found", 404);
    const allowed: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"], confirmed: ["processing", "cancelled"],
      processing: ["dispatched", "cancelled"], dispatched: ["delivered"], delivered: [], cancelled: [],
    };
    if (!allowed[current.order_status]?.includes(nextStatus)) return error("That order status change is not allowed", 409);
    const items = await env.DB.prepare("SELECT id, variant_id, quantity FROM order_items WHERE order_id = ?").bind(id).all<{ id: string; variant_id: string | null; quantity: number }>();
    const lines = items.results ?? [];
    if (!lines.length) return error("This order has no valid line items", 409);
    const guard = nextStatus === "dispatched"
      ? "NOT EXISTS (SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = orders.id AND (v.stock_on_hand < oi.quantity OR v.reserved_quantity < oi.quantity))"
      : nextStatus === "cancelled"
        ? "NOT EXISTS (SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = orders.id AND v.reserved_quantity < oi.quantity)"
        : "1 = 1";
    const now = new Date().toISOString();
    const statements = [env.DB.prepare("UPDATE orders SET order_status = ?, updated_at = ? WHERE id = ? AND order_status = ? AND " + guard).bind(nextStatus, now, id, current.order_status)];
    if (nextStatus === "cancelled") {
      for (const item of lines) statements.push(env.DB.prepare("UPDATE product_variants SET reserved_quantity = reserved_quantity - ?, updated_at = ? WHERE id = ? AND reserved_quantity >= ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND order_status = 'cancelled')")
        .bind(item.quantity, now, item.variant_id, item.quantity, id));
    }
    if (nextStatus === "dispatched") {
      for (const item of lines) {
        statements.push(env.DB.prepare("UPDATE product_variants SET stock_on_hand = stock_on_hand - ?, reserved_quantity = reserved_quantity - ?, updated_at = ? WHERE id = ? AND stock_on_hand >= ? AND reserved_quantity >= ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND order_status = 'dispatched')")
          .bind(item.quantity, item.quantity, now, item.variant_id, item.quantity, item.quantity, id));
        statements.push(env.DB.prepare("INSERT INTO inventory_movements (id, variant_id, movement_type, quantity_delta, reference_type, reference_id, note, actor_admin_id) SELECT ?, ?, 'sold', ?, 'order', ?, 'COD order dispatched', ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND order_status = 'dispatched')")
          .bind(crypto.randomUUID(), item.variant_id, -item.quantity, id, admin.admin_user_id, id));
      }
    }
    statements.push(env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) SELECT ?, ?, ?, 'order', ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND order_status = ?)")
      .bind(crypto.randomUUID(), admin.admin_user_id, "order.status_changed", id, JSON.stringify({ from: current.order_status, to: nextStatus }), id, nextStatus));
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta?.changes ?? 0) !== 1) return error("Order or reserved stock changed. Refresh the order and try again.", 409);
    return json({ updated: true, order_status: nextStatus });
  } catch { return error("Order status could not be updated", 503); }
}

interface MediaAssetRow {
  id: string; object_key: string; media_type: string; mime_type: string; byte_size: number;
  alt_text: string; caption: string; status: string; created_at: string;
}

async function adminMediaRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const fileMatch = path.match(/^\/api\/admin\/media\/([a-f0-9-]{36})\/file$/i);
  const assetMatch = path.match(/^\/api\/admin\/media\/([a-f0-9-]{36})$/i);
  const collection = path === "/api/admin/media";
  if (!collection && !assetMatch && !fileMatch) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Media service is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  const canManage = ["owner", "manager", "catalogue"].includes(admin.role);

  if (collection && request.method === "GET") {
    try {
      const rows = await env.DB.prepare("SELECT id, media_type, mime_type, byte_size, alt_text, caption, status, created_at FROM media_assets WHERE status <> 'archived' ORDER BY created_at DESC LIMIT 100").all<MediaAssetRow>();
      return json({ media: (rows.results ?? []).map(({ id, media_type, mime_type, byte_size, alt_text, caption, status, created_at }) => ({ id, media_type, mime_type, byte_size, alt_text, caption, status, created_at, url: "/api/admin/media/" + id + "/file" })) });
    } catch { return error("Media library could not be loaded", 503); }
  }

  if (fileMatch && request.method === "GET") {
    try {
      const asset = await env.DB.prepare("SELECT object_key, mime_type, status FROM media_assets WHERE id = ? LIMIT 1").bind(fileMatch[1]).first<{ object_key: string; mime_type: string; status: string }>();
      if (!asset || asset.status === "archived") return error("Media not found", 404);
      const object = await env.MEDIA.get(asset.object_key);
      if (!object) return error("Media not found", 404);
      return new Response(object.body, { headers: { "content-type": asset.mime_type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
    } catch { return error("Media file could not be loaded", 503); }
  }

  if (!canManage) return error("You do not have permission to manage media", 403);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);

  if (collection && request.method === "POST") {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 5_500_000) return error("Image is too large. Maximum size is 5 MB.", 413);
    let form: FormData;
    try { form = await request.formData(); } catch { return error("Upload a valid image file", 400); }
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 5_000_000) return error("Choose an image up to 5 MB", 400);
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const ext = extensions[file.type];
    if (!ext) return error("Only JPG, PNG and WebP images are supported", 415);
    const bytes = await file.arrayBuffer();
    const b = new Uint8Array(bytes);
    const signature = (file.type === "image/jpeg" && b[0] === 255 && b[1] === 216 && b[2] === 255)
      || (file.type === "image/png" && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71)
      || (file.type === "image/webp" && String.fromCharCode(...b.slice(8, 12)) === "WEBP");
    if (!signature) return error("The file content does not match its image type", 415);
    const id = crypto.randomUUID();
    const key = "catalogue/" + id + "." + ext;
    const altText = cleanText(form.get("alt_text"), 240);
    const caption = cleanText(form.get("caption"), 500);
    try {
      await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { assetId: id } });
      await env.DB.prepare("INSERT INTO media_assets (id, object_key, media_type, mime_type, byte_size, alt_text, caption, status, uploaded_by) VALUES (?, ?, 'image', ?, ?, ?, ?, 'ready', ?)")
        .bind(id, key, file.type, file.size, altText, caption, admin.admin_user_id).run();
      await env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), admin.admin_user_id, "media.uploaded", "media_asset", id, JSON.stringify({ mime_type: file.type, byte_size: file.size })).run();
      return json({ uploaded: true, media: { id, media_type: "image", mime_type: file.type, byte_size: file.size, alt_text: altText, caption, status: "ready", url: "/api/admin/media/" + id + "/file" } }, 201);
    } catch {
      try { await env.MEDIA.delete(key); } catch { /* best-effort cleanup */ }
      return error("Image could not be saved. Please try again.", 503);
    }
  }

  if (assetMatch && request.method === "PATCH") {
    const body = await readJson(request);
    if (!body) return error("Submit valid media details", 400);
    const altText = cleanText(body.alt_text, 240);
    const caption = cleanText(body.caption, 500);
    try {
      const result = await env.DB.prepare("UPDATE media_assets SET alt_text = ?, caption = ?, updated_at = ? WHERE id = ? AND status <> 'archived'")
        .bind(altText, caption, new Date().toISOString(), assetMatch[1]).run();
      if ((result.meta?.changes ?? 0) !== 1) return error("Media item not found", 404);
      await env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), admin.admin_user_id, "media.updated", "media_asset", assetMatch[1], JSON.stringify({ alt_text: altText, caption })).run();
      return json({ updated: true });
    } catch { return error("Media details could not be updated", 503); }
  }

  if (assetMatch && request.method === "DELETE") {
    if (!["owner", "manager"].includes(admin.role)) return error("Only an owner or manager can archive media", 403);
    try {
      const used = await env.DB.prepare("SELECT id FROM products WHERE image_key = ? LIMIT 1").bind(assetMatch[1]).first<{ id: string }>();
      if (used) return error("This image is assigned to a product. Remove it from the product before archiving.", 409);
      const result = await env.DB.prepare("UPDATE media_assets SET status = 'archived', updated_at = ? WHERE id = ? AND status <> 'archived'").bind(new Date().toISOString(), assetMatch[1]).run();
      if ((result.meta?.changes ?? 0) !== 1) return error("Media item not found", 404);
      await env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), admin.admin_user_id, "media.archived", "media_asset", assetMatch[1], "{}").run();
      return json({ archived: true });
    } catch { return error("Media item could not be archived", 503); }
  }
  return error("Method not allowed", 405);
}

async function adminProductImageRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/admin\/products\/([a-f0-9-]{36})\/image$/i);
  if (!match) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); } catch { return error("Product image service is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "catalogue"].includes(admin.role)) return error("You do not have permission to change product images", 403);
  if (request.method !== "PATCH") return error("Method not allowed", 405);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  const body = await readJson(request);
  if (!body || (body.image_id !== null && (typeof body.image_id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.image_id)))) return error("Choose a valid image", 400);
  try {
    const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? LIMIT 1").bind(match[1]).first<{ id: string }>();
    if (!product) return error("Product not found", 404);
    if (body.image_id) {
      const media = await env.DB.prepare("SELECT id FROM media_assets WHERE id = ? AND media_type = 'image' AND status = 'ready' LIMIT 1").bind(body.image_id).first<{ id: string }>();
      if (!media) return error("Image not found or unavailable", 404);
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE products SET image_key = ?, updated_at = ? WHERE id = ?").bind(body.image_id, new Date().toISOString(), match[1]),
      env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), admin.admin_user_id, "product.image_changed", "product", match[1], JSON.stringify({ image_id: body.image_id })),
    ]);
    return json({ updated: true, image_key: body.image_id });
  } catch { return error("Product image could not be updated", 503); }
}

interface AdminVariantRow {
  id: string;
  product_id: string;
  sku: string | null;
  size: string;
  color: string;
  stock_on_hand: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface AdminInventoryMovementRow {
  id: string;
  movement_type: string;
  quantity_delta: number;
  reference_type: string;
  reference_id: string | null;
  note: string;
  created_at: string;
}

async function adminInventoryRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const productVariants = path.match(/^\/api\/admin\/products\/([a-f0-9-]{36})\/variants$/i);
  const variantResource = path.match(/^\/api\/admin\/variants\/([a-f0-9-]{36})$/i);
  const variantStock = path.match(/^\/api\/admin\/variants\/([a-f0-9-]{36})\/stock$/i);
  const variantMovements = path.match(/^\/api\/admin\/variants\/([a-f0-9-]{36})\/movements$/i);
  if (!productVariants && !variantResource && !variantStock && !variantMovements) return null;

  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Inventory service is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);

  const productId = productVariants?.[1] ?? null;
  const variantId = variantResource?.[1] ?? variantStock?.[1] ?? variantMovements?.[1] ?? null;

  if (productVariants && request.method === "GET") {
    try {
      const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? LIMIT 1").bind(productId).first<{ id: string }>();
      if (!product) return error("Product not found", 404);
      const rows = await env.DB.prepare("SELECT id, product_id, sku, size, color, stock_on_hand, is_active, created_at, updated_at FROM product_variants WHERE product_id = ? ORDER BY size, color, sku")
        .bind(productId).all<AdminVariantRow>();
      return json({ variants: rows.results ?? [] });
    } catch { return error("Product variants could not be loaded", 503); }
  }

  if (productVariants && request.method === "POST") {
    if (!["owner", "manager", "catalogue"].includes(admin.role)) return error("You do not have permission to create product variants", 403);
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request);
    if (!body) return error("Please submit valid variant details", 400);
    const skuText = cleanText(body.sku, 64).toUpperCase();
    const sku = skuText || null;
    const size = cleanText(body.size, 32);
    const color = cleanText(body.color, 32);
    const initialStock = body.initial_stock === undefined ? 0 : body.initial_stock;
    if ((sku && !/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(sku)) || size.length > 32 || color.length > 32 || !Number.isSafeInteger(initialStock) || Number(initialStock) < 0 || Number(initialStock) > 1_000_000 || (!size && !color && !sku)) {
      return error("Enter a valid SKU, size or colour and a non-negative opening quantity", 400);
    }
    try {
      const product = await env.DB.prepare("SELECT id, status FROM products WHERE id = ? LIMIT 1").bind(productId).first<{ id: string; status: string }>();
      if (!product) return error("Product not found", 404);
      if (product.status === "archived") return error("Archived products cannot receive new variants", 409);
      const id = crypto.randomUUID();
      const statements = [
        env.DB.prepare("INSERT INTO product_variants (id, product_id, sku, size, color, stock_on_hand) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(id, productId, sku, size, color, Number(initialStock)),
      ];
      if (Number(initialStock) > 0) {
        statements.push(env.DB.prepare("INSERT INTO inventory_movements (id, variant_id, movement_type, quantity_delta, reference_type, note, actor_admin_id) VALUES (?, ?, 'opening', ?, 'manual', ?, ?)")
          .bind(crypto.randomUUID(), id, Number(initialStock), "Opening stock", admin.admin_user_id));
      }
      statements.push(env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), admin.admin_user_id, "variant.created", "product_variant", id, JSON.stringify({ product_id: productId, sku, size, color, initial_stock: Number(initialStock) })));
      await env.DB.batch(statements);
      const created = await env.DB.prepare("SELECT id, product_id, sku, size, color, stock_on_hand, is_active, created_at, updated_at FROM product_variants WHERE id = ? LIMIT 1").bind(id).first<AdminVariantRow>();
      return json({ created: true, variant: created }, 201);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (/unique|constraint/i.test(message)) return error("That SKU is already in use", 409);
      return error("Variant could not be created", 503);
    }
  }

  if (variantMovements && request.method === "GET") {
    try {
      const variant = await env.DB.prepare("SELECT id FROM product_variants WHERE id = ? LIMIT 1").bind(variantId).first<{ id: string }>();
      if (!variant) return error("Variant not found", 404);
      const rows = await env.DB.prepare("SELECT id, movement_type, quantity_delta, reference_type, reference_id, note, created_at FROM inventory_movements WHERE variant_id = ? ORDER BY created_at DESC LIMIT 100")
        .bind(variantId).all<AdminInventoryMovementRow>();
      return json({ movements: rows.results ?? [] });
    } catch { return error("Stock history could not be loaded", 503); }
  }

  if (variantResource && request.method === "PATCH") {
    if (!["owner", "manager", "catalogue"].includes(admin.role)) return error("You do not have permission to edit variants", 403);
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request);
    if (!body) return error("Please submit valid variant details", 400);
    const skuText = Object.prototype.hasOwnProperty.call(body, "sku") ? cleanText(body.sku, 64).toUpperCase() : undefined;
    const sku = skuText === "" ? null : skuText;
    const size = Object.prototype.hasOwnProperty.call(body, "size") ? cleanText(body.size, 32) : undefined;
    const color = Object.prototype.hasOwnProperty.call(body, "color") ? cleanText(body.color, 32) : undefined;
    const active = Object.prototype.hasOwnProperty.call(body, "is_active") ? body.is_active : undefined;
    if ((sku !== undefined && sku !== null && !/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(sku)) || (active !== undefined && active !== 0 && active !== 1 && active !== false && active !== true)) return error("Enter valid variant details", 400);
    try {
      const current = await env.DB.prepare("SELECT id, product_id, sku, size, color, stock_on_hand, is_active, created_at, updated_at FROM product_variants WHERE id = ? LIMIT 1")
        .bind(variantId).first<AdminVariantRow>();
      if (!current) return error("Variant not found", 404);
      const nextActive = active === undefined ? current.is_active : (active === true || active === 1 ? 1 : 0);
      if (nextActive === 0 && current.stock_on_hand > 0) return error("Move or adjust the remaining stock before deactivating this variant", 409);
      const nextSku = sku === undefined ? current.sku : sku;
      const nextSize = size === undefined ? current.size : size;
      const nextColor = color === undefined ? current.color : color;
      if (!nextSku && !nextSize && !nextColor) return error("A variant must have a SKU, size or colour", 400);
      await env.DB.batch([
        env.DB.prepare("UPDATE product_variants SET sku = ?, size = ?, color = ?, is_active = ?, updated_at = ? WHERE id = ?")
          .bind(nextSku, nextSize, nextColor, nextActive, new Date().toISOString(), variantId),
        env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), admin.admin_user_id, "variant.updated", "product_variant", variantId, JSON.stringify({ sku: nextSku, size: nextSize, color: nextColor, is_active: nextActive })),
      ]);
      return json({ updated: true, id: variantId });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (/unique|constraint/i.test(message)) return error("That SKU is already in use", 409);
      return error("Variant could not be updated", 503);
    }
  }

  if (variantStock && request.method === "POST") {
    if (!["owner", "manager", "orders"].includes(admin.role)) return error("You do not have permission to change stock", 403);
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request);
    if (!body) return error("Please submit a valid stock movement", 400);
    const movementType = cleanText(body.movement_type, 24);
    const quantityDelta = body.quantity_delta;
    const note = cleanText(body.note, 500);
    const referenceId = cleanText(body.reference_id, 120) || null;
    const referenceType = movementType === "received" ? "purchase" : movementType === "customer_return" ? "return" : "count";
    if (!["received", "customer_return", "adjustment"].includes(movementType) || !Number.isSafeInteger(quantityDelta) || Number(quantityDelta) === 0 || Math.abs(Number(quantityDelta)) > 1_000_000 || ((movementType === "received" || movementType === "customer_return") && Number(quantityDelta) < 0) || note.length < 3) {
      return error("Choose a valid stock movement, non-zero quantity and a short note", 400);
    }
    try {
      const current = await env.DB.prepare("SELECT id, stock_on_hand, is_active FROM product_variants WHERE id = ? LIMIT 1").bind(variantId).first<{ id: string; stock_on_hand: number; is_active: number }>();
      if (!current) return error("Variant not found", 404);
      if (current.is_active !== 1) return error("Inactive variants cannot receive stock movements", 409);
      const nextStock = current.stock_on_hand + Number(quantityDelta);
      if (nextStock < 0) return error("This movement would make stock negative", 409);
      const movementId = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE product_variants SET stock_on_hand = stock_on_hand + ?, updated_at = ? WHERE id = ? AND is_active = 1 AND stock_on_hand = ? AND stock_on_hand + ? >= 0")
          .bind(Number(quantityDelta), new Date().toISOString(), variantId, current.stock_on_hand, Number(quantityDelta)),
        env.DB.prepare("INSERT INTO inventory_movements (id, variant_id, movement_type, quantity_delta, reference_type, reference_id, note, actor_admin_id) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM product_variants WHERE id = ? AND stock_on_hand = ?)")
          .bind(movementId, variantId, movementType, Number(quantityDelta), referenceType, referenceId, note, admin.admin_user_id, variantId, nextStock),
        env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM inventory_movements WHERE id = ?)")
          .bind(crypto.randomUUID(), admin.admin_user_id, "inventory.movement_recorded", "product_variant", variantId, JSON.stringify({ movement_type: movementType, quantity_delta: Number(quantityDelta), reference_id: referenceId }), movementId),
      ]);
      if ((results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) return error("Stock changed while you were saving. Refresh and try again.", 409);
      return json({ recorded: true, id: movementId, stock_on_hand: nextStock });
    } catch { return error("Stock movement could not be recorded", 503); }
  }

  return error("Method not allowed", 405);
}

interface AdminEnquiryRow {
  id: string;
  enquiry_type: string;
  customer_name: string;
  phone: string;
  email: string | null;
  message: string;
  status: "new" | "contacted" | "qualified" | "closed" | "spam";
  source: string;
  created_at: string;
}

async function adminEnquiryRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const isCollection = path === "/api/admin/enquiries";
  const rawId = path.startsWith("/api/admin/enquiries/") ? path.slice("/api/admin/enquiries/".length) : "";
  const enquiryId = /^[a-f0-9-]{36}$/i.test(rawId) ? rawId : null;
  if (!isCollection && !enquiryId) return null;

  let admin: SessionRow | null;
  try {
    admin = await currentAdmin(request, env.DB);
  } catch {
    return error("Enquiry service is temporarily unavailable", 503);
  }
  if (!admin) return error("Authentication required", 401);

  if (isCollection && request.method === "GET") {
    try {
      const limitValue = Number(url.searchParams.get("limit") ?? "50");
      const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50;
      if (admin.role === "catalogue") return error("You do not have permission to view customer enquiries", 403);
      const rows = admin.role === "rental"
        ? await env.DB.prepare("SELECT id, enquiry_type, customer_name, phone, email, message, status, source, created_at FROM enquiries WHERE enquiry_type = 'rental' ORDER BY created_at DESC LIMIT ?").bind(limit).all<AdminEnquiryRow>()
        : await env.DB.prepare("SELECT id, enquiry_type, customer_name, phone, email, message, status, source, created_at FROM enquiries ORDER BY created_at DESC LIMIT ?").bind(limit).all<AdminEnquiryRow>();
      return json({ enquiries: rows.results ?? [] });
    } catch {
      return error("Enquiries could not be loaded", 503);
    }
  }

  if (!enquiryId || request.method !== "PATCH") return error("Method not allowed", 405);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  if (!["owner", "manager", "orders", "rental"].includes(admin.role)) return error("You do not have permission to update enquiries", 403);

  const body = await readJson(request);
  const status = cleanText(body?.status, 12);
  if (!["new", "contacted", "qualified", "closed", "spam"].includes(status)) return error("Choose a valid enquiry status", 400);
  try {
    const current = await env.DB.prepare(
      "SELECT id, enquiry_type, customer_name, phone, email, message, status, source, created_at FROM enquiries WHERE id = ? LIMIT 1",
    ).bind(enquiryId).first<AdminEnquiryRow>();
    if (!current) return error("Enquiry not found", 404);
    if (admin.role === "rental" && current.enquiry_type !== "rental") return error("Rental staff can only update rental enquiries", 403);
    if (admin.role === "orders" && current.enquiry_type === "rental") return error("Orders staff cannot update rental enquiries", 403);
    await env.DB.batch([
      env.DB.prepare("UPDATE enquiries SET status = ? WHERE id = ?").bind(status, enquiryId),
      env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), admin.admin_user_id, "enquiry.status_changed", "enquiry", enquiryId, JSON.stringify({ from: current.status, to: status })),
    ]);
    return json({ updated: true, id: enquiryId, status });
  } catch {
    return error("Enquiry could not be updated", 503);
  }
}

async function adminAuth(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/admin/")) return null;

  if (path === "/api/admin/bootstrap" && request.method === "POST") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    if (!env.ADMIN_BOOTSTRAP_TOKEN || env.ADMIN_BOOTSTRAP_TOKEN.length < 32) return error("Admin setup is not configured", 503);
    const body = await readJson(request);
    if (!body) return error("Please submit valid setup details", 400);
    const suppliedToken = cleanText(body.bootstrapToken, 256);
    const email = cleanText(body.email, 160).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!await constantTimeTextEqual(suppliedToken, env.ADMIN_BOOTSTRAP_TOKEN)) return error("Setup authorization failed", 403);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
      return error("Use a valid email and a password between 12 and 128 characters", 400);
    }
    let setupStage = "password_hash";
    try {
      const hash = await passwordHash(password);
      const id = crypto.randomUUID();
      setupStage = "database_batch";
      const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const tokenHash = await sha256(token);
      const results = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO admin_users (id, email, password_hash, role) SELECT ?, ?, ?, 'owner' WHERE NOT EXISTS (SELECT 1 FROM admin_users)",
        ).bind(id, email, hash),
        env.DB.prepare(
          "INSERT INTO admin_sessions (id, admin_user_id, token_hash, expires_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM admin_users WHERE id = ?)",
        ).bind(crypto.randomUUID(), id, tokenHash, expiresAt, id),
      ]);
      if ((results[0]?.meta?.changes ?? 0) !== 1) return error("Owner setup has already been completed", 409);
      if ((results[1]?.meta?.changes ?? 0) !== 1) {
        console.error("[admin-bootstrap] atomic session insert did not complete");
        return error("Owner setup could not be completed (SETUP-DB-02)", 503);
      }
      return json({ authenticated: true, admin: { id, email, role: "owner" } }, 201, { "set-cookie": sessionCookie(token, 12 * 60 * 60) });
    } catch (caught) {
      const failure = caught instanceof Error ? caught : new Error("Unknown setup failure");
      console.error("[admin-bootstrap] failed", { stage: setupStage, name: failure.name, message: failure.message });
      const code = setupStage === "password_hash" ? "SETUP-CRYPTO-01" : "SETUP-DB-01";
      return error(`Owner setup could not be completed (${code})`, 503);
    }
  }

  if (path === "/api/admin/login" && request.method === "POST") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request);
    if (!body) return error("Please submit valid login details", 400);
    const email = cleanText(body.email, 160).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 128) return error("Email or password is incorrect", 401);
    const address = cleanText(request.headers.get("cf-connecting-ip"), 64) || "unknown";
    const attemptKey = await sha256(`${address.toLowerCase()}|${email}`);
    const now = new Date().toISOString();
    try {
      const attempt = await env.DB.prepare("SELECT failure_count, locked_until, window_started_at FROM admin_login_attempts WHERE key_hash = ?")
        .bind(attemptKey).first<{ failure_count: number; locked_until: string | null; window_started_at: string }>();
      if (attempt?.locked_until && attempt.locked_until > now) return error("Too many attempts. Please try again later.", 429);
      const admin = await env.DB.prepare("SELECT id, email, role, is_active, password_hash FROM admin_users WHERE email = ? COLLATE NOCASE LIMIT 1")
        .bind(email).first<AdminRow>();
      const dummyHash = "pbkdf2-sha256$100000$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      const passwordMatches = await verifyPassword(password, admin?.password_hash ?? dummyHash);
      if (!admin || admin.is_active !== 1 || !passwordMatches) {
        await env.DB.prepare(
          "INSERT INTO admin_login_attempts (key_hash, failure_count, window_started_at, locked_until, updated_at) VALUES (?, 1, ?, NULL, ?) ON CONFLICT(key_hash) DO UPDATE SET failure_count = CASE WHEN julianday(window_started_at) <= julianday(excluded.window_started_at, '-15 minutes') THEN 1 ELSE failure_count + 1 END, window_started_at = CASE WHEN julianday(window_started_at) <= julianday(excluded.window_started_at, '-15 minutes') THEN excluded.window_started_at ELSE window_started_at END, locked_until = CASE WHEN (CASE WHEN julianday(window_started_at) <= julianday(excluded.window_started_at, '-15 minutes') THEN 1 ELSE failure_count + 1 END) >= 5 THEN strftime('%Y-%m-%dT%H:%M:%fZ', excluded.window_started_at, '+15 minutes') ELSE locked_until END, updated_at = excluded.updated_at",
        ).bind(attemptKey, now, now).run();
        const updated = await env.DB.prepare("SELECT locked_until FROM admin_login_attempts WHERE key_hash = ?").bind(attemptKey).first<{ locked_until: string | null }>();
        return updated?.locked_until && updated.locked_until > now
          ? error("Too many attempts. Please try again later.", 429)
          : error("Email or password is incorrect", 401);
      }
      await env.DB.prepare("DELETE FROM admin_login_attempts WHERE key_hash = ?").bind(attemptKey).run();
      const session = await createSession(env.DB, admin.id);
      await env.DB.prepare("UPDATE admin_users SET last_login_at = ? WHERE id = ?").bind(now, admin.id).run();
      return json({ authenticated: true, admin: { id: admin.id, email: admin.email, role: admin.role } }, 200, { "set-cookie": sessionCookie(session.token, 12 * 60 * 60) });
    } catch {
      return error("Sign-in is temporarily unavailable", 503);
    }
  }

  if (path === "/api/admin/me" && request.method === "GET") {
    try {
      const admin = await currentAdmin(request, env.DB);
      if (!admin) return error("Authentication required", 401);
      return json({ authenticated: true, admin: { id: admin.admin_user_id, email: admin.email, role: admin.role } });
    } catch {
      return error("Sign-in is temporarily unavailable", 503);
    }
  }

  if (path === "/api/admin/logout" && request.method === "POST") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    try {
      const token = cookieValue(request, "__Host-deverve_admin");
      if (token) await env.DB.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
        .bind(new Date().toISOString(), await sha256(token)).run();
      return json({ authenticated: false }, 200, { "set-cookie": sessionCookie("", 0) });
    } catch {
      return error("Sign-out could not be completed", 503);
    }
  }

  const orderResponse = await adminOrderRoutes(request, env, url);\n  if (orderResponse) return orderResponse;\n\n  const mediaResponse = await adminMediaRoutes(request, env, url);
  if (mediaResponse) return mediaResponse;

  const productImageResponse = await adminProductImageRoutes(request, env, url);
  if (productImageResponse) return productImageResponse;

  const inventoryResponse = await adminInventoryRoutes(request, env, url);
  if (inventoryResponse) return inventoryResponse;

  const enquiryResponse = await adminEnquiryRoutes(request, env, url);
  if (enquiryResponse) return enquiryResponse;

  const productResponse = await adminProductRoutes(request, env, url);
  if (productResponse) return productResponse;
  return error("Not found", 404);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "allow": "GET, POST, OPTIONS" } });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return error("Cross-origin requests are not accepted", 403);

  const adminResponse = await adminAuth(request, env, url);
  if (adminResponse) return adminResponse;

  const enquiryResponse = await adminEnquiryRoutes(request, env, url);
  if (enquiryResponse) return enquiryResponse;

  const productResponse = await adminProductRoutes(request, env, url);
  if (productResponse) return productResponse;

  if (url.pathname === "/api/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ status: "ok", database: "connected" });
    } catch {
      return error("Service temporarily unavailable", 503);
    }
  }

  const publicMedia = url.pathname.match(/^\/media\/([a-f0-9-]{36})$/i);
  if (publicMedia && request.method === "GET") {
    try {
      const asset = await env.DB.prepare("SELECT m.object_key, m.mime_type AS content_type FROM media_assets m JOIN products p ON p.image_key = m.id WHERE m.id = ? AND m.status = 'ready' AND p.status = 'published' LIMIT 1").bind(publicMedia[1]).first<{ object_key: string; content_type: string }>();
      if (!asset) return error("Media not found", 404);
      const object = await env.MEDIA.get(asset.object_key); if (!object) return error("Media not found", 404);
      return new Response(object.body, { headers: { "content-type": asset.content_type, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
    } catch { return error("Media is temporarily unavailable", 503); }
  }

  if (url.pathname === "/api/products" && request.method === "GET") {
    try {
      const category = cleanText(url.searchParams.get("category"), 60);
      const limitValue = Number(url.searchParams.get("limit") ?? "24");
      const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 60) : 24;
      const rows = category
        ? await env.DB.prepare(
            "SELECT id, slug, name, description, category, audience, retail_price_paisa, image_key FROM products WHERE status = 'published' AND category = ? ORDER BY created_at DESC LIMIT ?",
          ).bind(category, limit).all<ProductRow>()
        : await env.DB.prepare(
            "SELECT id, slug, name, description, category, audience, retail_price_paisa, image_key FROM products WHERE status = 'published' ORDER BY created_at DESC LIMIT ?",
          ).bind(limit).all<ProductRow>();
      return json({ products: rows.results ?? [] });
    } catch {
      return error("Catalogue is temporarily unavailable", 503);
    }
  }

  const publicOrderResponse = await publicOrderRoutes(request, env, url);\n  if (publicOrderResponse) return publicOrderResponse;\n\n  if (url.pathname === "/api/enquiries" && request.method === "POST") {
    const body = await readJson(request, 12_000);
    if (!body) return error("Please submit valid form details", 400);

    // Honeypot field: bots that fill hidden fields receive a neutral success response.
    if (cleanText(body.website, 120)) return json({ accepted: true });
    const enquiryType = cleanText(body.enquiryType, 20);
    const customerName = cleanText(body.name, 100);
    const phone = cleanText(body.phone, 24);
    const email = cleanText(body.email, 160).toLowerCase();
    const message = cleanText(body.message, 3000);
    if (!["retail", "wholesale", "rental", "general"].includes(enquiryType)) return error("Choose a valid enquiry type", 400);
    if (customerName.length < 2 || !validPhone(phone) || message.length < 5) return error("Please check your name, phone number and message", 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Please enter a valid email address", 400);

    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        "INSERT INTO enquiries (id, enquiry_type, customer_name, phone, email, message) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(id, enquiryType, customerName, phone, email || null, message).run();
      return json({ accepted: true, reference: id }, 201);
    } catch {
      return error("We could not save your enquiry. Please try again later.", 503);
    }
  }

  return error("Not found", 404);
}


export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
