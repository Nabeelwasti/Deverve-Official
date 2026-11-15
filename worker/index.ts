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
  SAFEPAY_ENV?: string;
  SAFEPAY_MERCHANT_API_KEY?: string;
  SAFEPAY_SECRET_KEY?: string;
  SAFEPAY_WEBHOOK_SECRET?: string;
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
  seo_title: string;
  seo_description: string;
}
interface PublicVariantRow { id: string; product_id: string; sku: string | null; size: string; color: string; stock_on_hand: number; reserved_quantity: number; }
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
  seo_title: string;
  seo_description: string;
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

/**
 * datetime-local values from the rental form are Pakistan wall-clock times.
 * Cloudflare Workers run in UTC, so timezone-less values must not use Date.parse.
 * Explicitly zoned ISO timestamps remain supported for API clients.
 */
export function parseRentalDateTime(value: string): number {
  const input = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(input)) return Date.parse(input);
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return Number.NaN;
  const [, y, mo, d, h, mi, s = "0"] = match;
  const parts = [y, mo, d, h, mi, s].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const wallClock = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (wallClock.getUTCFullYear() !== year || wallClock.getUTCMonth() !== month - 1 || wallClock.getUTCDate() !== day || wallClock.getUTCHours() !== hour || wallClock.getUTCMinutes() !== minute || wallClock.getUTCSeconds() !== second) return Number.NaN;
  return wallClock.getTime() - 5 * 60 * 60 * 1000;
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

/**
 * Fixed-window rate limit for public write endpoints.
 * Cloudflare supplies CF-Connecting-IP at the edge. Only a one-way digest is
 * stored in D1; the raw client address is never persisted.
 *
 * Local development without Cloudflare's edge header intentionally skips this
 * control so developers can test forms. Production Pages requests include it.
 */
async function enforcePublicRateLimit(
  request: Request,
  env: Env,
  scope: string,
  limit: number,
  windowSeconds = 15 * 60,
): Promise<Response | null> {
  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  if (!clientIp) return null;
  if (clientIp.length > 64) return error("Request could not be verified", 400);
  const bucketKey = await sha256("deverve-public-rate-limit:v1:" + scope + ":" + clientIp);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const expiresAt = windowStart + windowSeconds * 2;
  try {
    const row = await env.DB.prepare(
      "INSERT INTO public_rate_limits (bucket_key, window_start, request_count, expires_at) VALUES (?, ?, 1, ?) ON CONFLICT(bucket_key) DO UPDATE SET request_count = CASE WHEN public_rate_limits.window_start = excluded.window_start THEN public_rate_limits.request_count + 1 ELSE 1 END, window_start = excluded.window_start, expires_at = excluded.expires_at RETURNING request_count",
    ).bind(bucketKey, windowStart, expiresAt).first<{ request_count: number }>();
    if (!row || !Number.isInteger(row.request_count)) return error("Request protection is temporarily unavailable. Please try again shortly.", 503);
    if (row.request_count > limit) {
      const retryAfter = Math.max(1, windowStart + windowSeconds - now);
      return json({ error: "Too many requests. Please wait before trying again." }, 429, { "retry-after": String(retryAfter) });
    }
    return null;
  } catch {
    return error("Request protection is temporarily unavailable. Please try again shortly.", 503);
  }
}

async function verifyTurnstile(request: Request, tokenValue: unknown): Promise<boolean> {
  const token = cleanText(tokenValue, 2048);
  if (!token) return false;
  try {
    const origin = request.headers.get("origin") || new URL(request.url).origin;
    const response = await fetch("https://deverve-turnstile-verify.wastinabeel99.workers.dev", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
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
  seoTitle: string;
  seoDescription: string;
}

function normalizeProduct(body: Record<string, unknown>, current?: AdminProductRow): NormalizedProduct | null {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  const name = has("name") ? cleanText(body.name, 120) : current?.name ?? "";
  const description = has("description") ? cleanText(body.description, 4000) : current?.description ?? "";
  const seoTitle = has("seo_title") ? cleanText(body.seo_title, 70) : current?.seo_title ?? "";
  const seoDescription = has("seo_description") ? cleanText(body.seo_description, 160) : current?.seo_description ?? "";
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
    retailPrice, wholesalePrice, seoTitle, seoDescription,
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
        ? await env.DB.prepare("SELECT id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, updated_at, image_key, seo_title, seo_description FROM products WHERE status = ? ORDER BY updated_at DESC LIMIT ?").bind(status, limit).all<AdminProductRow>()
        : await env.DB.prepare("SELECT id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, updated_at, image_key FROM products ORDER BY updated_at DESC LIMIT ?").bind(limit).all<AdminProductRow>();
      const productRows = rows.results ?? [];
      if (!productRows.length) return json({ products: [] });
      const productIds = productRows.map((product) => product.id);
      const placeholders = productIds.map(() => "?").join(",");
      const variantRows = await env.DB.prepare("SELECT id, product_id, sku, size, color, stock_on_hand, reserved_quantity FROM product_variants WHERE is_active = 1 AND product_id IN (" + placeholders + ") ORDER BY size, color LIMIT 500").bind(...productIds).all<PublicVariantRow>();
      const variantsByProduct = new Map<string, Array<PublicVariantRow & { available_quantity: number }>>();
      for (const variant of variantRows.results ?? []) {
        const available = Math.max(0, variant.stock_on_hand - variant.reserved_quantity);
        if (available < 1) continue;
        variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) ?? []), { ...variant, available_quantity: available }]);
      }
      return json({ products: productRows.map((product) => ({ ...product, variants: variantsByProduct.get(product.id) ?? [] })) });
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
        env.DB.prepare("INSERT INTO products (id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, seo_title, seo_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(id, product.slug, product.name, product.description, product.category, product.audience, product.status, product.retailPrice, product.wholesalePrice, product.seoTitle, product.seoDescription),
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
      const current = await env.DB.prepare("SELECT id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, updated_at, image_key, seo_title, seo_description FROM products WHERE id = ? LIMIT 1")
        .bind(id).first<AdminProductRow>();
      if (!current) return error("Product not found", 404);
      const product = normalizeProduct(body, current);
      if (!product) return error("Check the product name, slug, category, audience, status and prices", 400);
      if (admin.role === "catalogue" && product.status !== "draft" && product.status !== current.status) return error("Only an owner or manager can change publication status", 403);
      const duplicate = await env.DB.prepare("SELECT id FROM products WHERE slug = ? AND id <> ? LIMIT 1").bind(product.slug, id).first<{ id: string }>();
      if (duplicate) return error("A product with this URL slug already exists", 409);
      await env.DB.batch([
        env.DB.prepare("UPDATE products SET slug = ?, name = ?, description = ?, category = ?, audience = ?, status = ?, retail_price_paisa = ?, wholesale_price_paisa = ?, seo_title = ?, seo_description = ?, updated_at = ? WHERE id = ?")
          .bind(product.slug, product.name, product.description, product.category, product.audience, product.status, product.retailPrice, product.wholesalePrice, product.seoTitle, product.seoDescription, new Date().toISOString(), id),
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
  total_paisa: number; payment_method: string; payment_provider: string; payment_status: string; order_status: string;
  delivery_fee_status: string; delivery_fee_expires_at: string | null;
  customer_note: string; created_at: string; updated_at: string;
}
interface OrderItemRow {
  id: string; order_id: string; variant_id: string | null; product_name_snapshot: string;
  sku_snapshot: string | null; size_snapshot: string; color_snapshot: string;
  quantity: number; unit_price_paisa: number; line_total_paisa: number;
}

async function publicOrderRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/orders" || request.method !== "POST") return null;
  const limited = await enforcePublicRateLimit(request, env, "checkout", 5);
  if (limited) return limited;
  const body = await readJson(request, 12_000);
  if (!body) return error("Please submit valid checkout details", 400);
  if (cleanText(body.website, 120)) return json({ accepted: true });
  if (!(await verifyTurnstile(request, body.turnstile_token))) return error("Please complete the security check and try again.", 403);
  const token = cleanText(body.checkout_token, 64);
  if (!/^[a-f0-9-]{36}$/i.test(token)) return error("Refresh checkout and try again", 400);
  const requestedPaymentProvider = cleanText(body.payment_provider, 20) || "manual";
  if (!["manual", "safepay"].includes(requestedPaymentProvider)) return error("Choose a valid payment method", 400);
  if (requestedPaymentProvider === "safepay" && !getSafepayConfig(env)) return error("Online payment is not enabled yet. Please choose cash on delivery.", 503);
  let signedInCustomer: CustomerSessionRow | null = null;
  try { signedInCustomer = await currentCustomer(request, env.DB); } catch { return error("Customer account service is temporarily unavailable. Please try again.", 503); }
  try {
    const existing = await env.DB.prepare("SELECT order_number, total_paisa, order_status, payment_provider FROM orders WHERE checkout_token = ? LIMIT 1")
      .bind(token).first<{ order_number: string; total_paisa: number; order_status: string; payment_provider: string }>();
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
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Please enter a valid email address", 400);
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
    const orderValues: unknown[] = [id, orderNumber, customerName, phone, email || null, address, city, subtotal, deliveryFee, total, note, token, "pending_quote"];
    for (const line of lines) orderValues.push(line.variant.id, line.quantity);
    const statements = [
      env.DB.prepare("INSERT INTO orders (id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, customer_note, checkout_token, delivery_fee_status) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE " + conditions).bind(...orderValues),
    ];
    for (const line of lines) {
      statements.push(env.DB.prepare("UPDATE product_variants SET reserved_quantity = reserved_quantity + ?, updated_at = ? WHERE id = ? AND is_active = 1 AND stock_on_hand - reserved_quantity >= ? AND EXISTS (SELECT 1 FROM orders WHERE id = ?)")
        .bind(line.quantity, now, line.variant.id, line.quantity, id));
      statements.push(env.DB.prepare("INSERT INTO order_items (id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?)")
        .bind(crypto.randomUUID(), id, line.variant.id, line.variant.name, line.variant.sku, line.variant.size, line.variant.color, line.quantity, line.variant.retail_price_paisa, line.lineTotal, id));
    }
    if (requestedPaymentProvider === "safepay") statements.push(env.DB.prepare("UPDATE orders SET payment_provider = 'safepay' WHERE id = ? AND payment_provider = 'manual'").bind(id));
    statements.push(env.DB.prepare("INSERT INTO order_status_events (id, order_id, from_status, to_status, actor_type, note) SELECT ?, ?, NULL, 'pending', 'system', 'Order received' WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND order_status = 'pending')").bind(crypto.randomUUID(), id, id));
    if (requestedPaymentProvider === "safepay" && !signedInCustomer) return error("Please sign in to your De VERVE account before choosing online payment.", 401);
    if (signedInCustomer) statements.push(env.DB.prepare("UPDATE orders SET customer_id = ? WHERE id = ? AND customer_id IS NULL").bind(signedInCustomer.customer_id, id));
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta?.changes ?? 0) !== 1) return error("Stock changed while you were checking out. Please review your cart and try again.", 409);
    if (signedInCustomer && (results[results.length - 1]?.meta?.changes ?? 0) !== 1) return error("Your order was created, but could not be linked to your account. Please contact De VERVE with reference " + orderNumber + ".", 503);
    return json({ accepted: true, order_number: orderNumber, subtotal_paisa: subtotal, delivery_fee_paisa: deliveryFee, total_paisa: total, order_status: "pending", payment_provider: requestedPaymentProvider }, 201);
  } catch (caught) {
    console.error("[checkout] failed", caught instanceof Error ? caught.message : "unknown error");
    try {
      const existing = await env.DB.prepare("SELECT order_number, total_paisa, order_status, payment_provider FROM orders WHERE checkout_token = ? LIMIT 1")
        .bind(token).first<{ order_number: string; total_paisa: number; order_status: string; payment_provider: string }>();
      if (existing) return json({ accepted: true, duplicate: true, ...existing });
    } catch { /* report the original safe error */ }
    return error("Your order could not be placed. Please try again or contact us on WhatsApp.", 503);
  }
}

async function publicDeliveryFeeRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/delivery-fee\/([A-Za-z0-9_-]{40,50})$/);
  if (!match) return null;
  const limited = await enforcePublicRateLimit(request, env, "delivery-fee-approval", 12);
  if (limited) return limited;
  const tokenHash = await sha256(match[1]);
  const now = new Date().toISOString();
  if (request.method === "GET") {
    try {
      const order = await env.DB.prepare(
        "SELECT order_number, customer_name, subtotal_paisa, delivery_fee_paisa, total_paisa, delivery_fee_expires_at FROM orders WHERE delivery_fee_token_hash = ? AND delivery_fee_status = 'awaiting_customer' AND delivery_fee_expires_at > ? AND order_status IN ('pending','confirmed') LIMIT 1",
      ).bind(tokenHash, now).first<{ order_number: string; customer_name: string; subtotal_paisa: number; delivery_fee_paisa: number; total_paisa: number; delivery_fee_expires_at: string }>();
      return order ? json({ order }) : error("This delivery quotation is invalid, expired or already used.", 410);
    } catch { return error("Delivery quotation is temporarily unavailable.", 503); }
  }
  if (request.method !== "POST") return error("Method not allowed", 405);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  const body = await readJson(request, 1000);
  const decision = cleanText(body?.decision, 12);
  if (decision !== "accept" && decision !== "decline") return error("Choose whether to accept or decline the delivery total.", 400);
  try {
    const order = await env.DB.prepare(
      "SELECT id, order_status FROM orders WHERE delivery_fee_token_hash = ? AND delivery_fee_status = 'awaiting_customer' AND delivery_fee_expires_at > ? AND order_status IN ('pending','confirmed') LIMIT 1",
    ).bind(tokenHash, now).first<{ id: string; order_status: string }>();
    if (!order) return error("This delivery quotation is invalid, expired or already used.", 410);
    if (decision === "accept") {
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE orders SET delivery_fee_status = 'accepted', delivery_fee_token_hash = NULL, delivery_fee_expires_at = NULL, delivery_fee_accepted_at = ?, updated_at = ? WHERE id = ? AND delivery_fee_token_hash = ? AND delivery_fee_status = 'awaiting_customer' AND delivery_fee_expires_at > ?").bind(now, now, order.id, tokenHash, now),
        env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) SELECT ?, NULL, 'order.delivery_fee_accepted', 'order', ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND delivery_fee_status = 'accepted' AND delivery_fee_accepted_at = ?)").bind(crypto.randomUUID(), order.id, JSON.stringify({ decision: "accepted_by_customer" }), order.id, now),
      ]);
      return (results[0]?.meta?.changes ?? 0) === 1 ? json({ accepted: true, message: "Thank you. Your final COD total is confirmed. De VERVE will contact you about delivery." }) : error("This quotation has already been used. Please contact De VERVE.", 409);
    }
    const items = await env.DB.prepare("SELECT id, variant_id, quantity FROM order_items WHERE order_id = ?").bind(order.id).all<{ variant_id: string | null; quantity: number }>();
    const lines = items.results ?? [];
    if (!lines.length) return error("The order could not be cancelled safely. Please contact De VERVE.", 409);
    const statements = [
      env.DB.prepare("UPDATE orders SET order_status = 'cancelled', delivery_fee_status = 'declined', delivery_fee_token_hash = NULL, delivery_fee_expires_at = NULL, updated_at = ? WHERE id = ? AND delivery_fee_token_hash = ? AND delivery_fee_status = 'awaiting_customer' AND delivery_fee_expires_at > ?").bind(now, order.id, tokenHash, now),
    ];
    for (const item of lines) {
      if (!item.variant_id) continue;
      statements.push(env.DB.prepare("UPDATE product_variants SET reserved_quantity = reserved_quantity - ?, updated_at = ? WHERE id = ? AND reserved_quantity >= ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND order_status = 'cancelled' AND delivery_fee_status = 'declined')").bind(item.quantity, now, item.variant_id, item.quantity, order.id));
    }
    statements.push(env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) SELECT ?, NULL, 'order.delivery_fee_declined', 'order', ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND order_status = 'cancelled' AND delivery_fee_status = 'declined')").bind(crypto.randomUUID(), order.id, JSON.stringify({ decision: "declined_by_customer" }), order.id));
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta?.changes ?? 0) !== 1) return error("This quotation has already been used. Please contact De VERVE.", 409);
    return json({ declined: true, message: "Your order has been cancelled and its reserved stock has been released. Contact De VERVE if you would like a revised quotation." });
  } catch { return error("Your decision could not be saved. Please contact De VERVE.", 503); }
}

async function adminReturnRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const collection = url.pathname === "/api/admin/returns";
  const match = url.pathname.match(/^\/api\/admin\/returns\/([a-f0-9-]{36})$/i);
  if (!collection && !match) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); } catch { return error("Return management is temporarily unavailable.", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "orders"].includes(admin.role)) return error("You do not have permission to manage returns.", 403);

  if (collection && request.method === "GET") {
    try {
      const rows = await env.DB.prepare("SELECT r.id, r.order_id, r.customer_id, r.return_number, r.reason, r.details, r.status, r.refund_amount_paisa, r.refund_method, r.refund_reference, r.admin_note, r.created_at, r.updated_at, o.order_number, o.payment_provider, o.payment_status, c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone FROM return_requests r JOIN orders o ON o.id = r.order_id JOIN customers c ON c.id = r.customer_id ORDER BY r.created_at DESC LIMIT 100")
        .all<Record<string, unknown>>();
      const returns = rows.results ?? [];
      if (!returns.length) return json({ returns: [] });
      const ids = returns.map((item) => String(item.id));
      const placeholders = ids.map(() => "?").join(",");
      const items = await env.DB.prepare("SELECT ri.id, ri.return_request_id, ri.order_item_id, ri.quantity, ri.unit_refund_paisa, oi.product_name_snapshot, oi.sku_snapshot, oi.size_snapshot, oi.color_snapshot FROM return_request_items ri JOIN order_items oi ON oi.id = ri.order_item_id WHERE ri.return_request_id IN (" + placeholders + ") ORDER BY ri.rowid")
        .bind(...ids).all<Record<string, unknown>>();
      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const item of items.results ?? []) { const id = String(item.return_request_id); grouped.set(id, [...(grouped.get(id) ?? []), item]); }
      return json({ returns: returns.map((item) => ({ ...item, items: grouped.get(String(item.id)) ?? [] })) });
    } catch { return error("Return requests could not be loaded.", 503); }
  }

  if (!match || request.method !== "PATCH") return error("Method not allowed", 405);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  const body = await readJson(request, 4_000);
  const nextStatus = cleanText(body?.status, 20);
  const adminNote = cleanText(body?.admin_note, 500);
  const refundMethod = cleanText(body?.refund_method, 30);
  const refundReference = cleanText(body?.refund_reference, 120);
  if (!["approved", "rejected", "received", "refunded"].includes(nextStatus)) return error("Choose a valid return status.", 400);
  if (nextStatus === "refunded" && (!["bank_transfer", "cash", "store_credit"].includes(refundMethod) || refundReference.length < 3)) return error("Record the manual refund method and its reference before completing this request.", 400);
  try {
    const current = await env.DB.prepare("SELECT id, order_id, status, refund_amount_paisa FROM return_requests WHERE id = ? LIMIT 1")
      .bind(match[1]).first<{ id: string; order_id: string; status: string; refund_amount_paisa: number }>();
    if (!current) return error("Return request not found.", 404);
    const allowed: Record<string, string[]> = {
      requested: ["approved", "rejected"],
      approved: ["received"],
      received: ["refunded"],
      rejected: [],
      refunded: [],
    };
    if (!allowed[current.status]?.includes(nextStatus)) return error("That return status change is not allowed.", 409);
    const now = new Date().toISOString();
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE return_requests SET status = ?, admin_note = ?, refund_method = COALESCE(?, refund_method), refund_reference = COALESCE(?, refund_reference), reviewed_by_admin_id = CASE WHEN ? IN ('approved','rejected') THEN ? ELSE reviewed_by_admin_id END, received_at = CASE WHEN ? = 'received' THEN ? ELSE received_at END, refunded_at = CASE WHEN ? = 'refunded' THEN ? ELSE refunded_at END, updated_at = ? WHERE id = ? AND status = ?")
        .bind(nextStatus, adminNote, nextStatus === "refunded" ? refundMethod : null, nextStatus === "refunded" ? refundReference : null, nextStatus, admin.admin_user_id, nextStatus, now, nextStatus, now, now, current.id, current.status),
      env.DB.prepare("INSERT INTO return_status_events (id, return_request_id, from_status, to_status, actor_type, actor_id, note) SELECT ?, ?, ?, ?, 'admin', ?, ? WHERE EXISTS (SELECT 1 FROM return_requests WHERE id = ? AND status = ?)")
        .bind(crypto.randomUUID(), current.id, current.status, nextStatus, admin.admin_user_id, adminNote || "Return status updated by De VERVE team", current.id, nextStatus),
      env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) SELECT ?, ?, ?, 'return_request', ?, ? WHERE EXISTS (SELECT 1 FROM return_requests WHERE id = ? AND status = ?)")
        .bind(crypto.randomUUID(), admin.admin_user_id, "return.status_changed", current.id, JSON.stringify({ from: current.status, to: nextStatus, refund_method: nextStatus === "refunded" ? refundMethod : null, refund_reference: nextStatus === "refunded" ? refundReference : null }), current.id, nextStatus),
    ]);
    if ((results[0]?.meta?.changes ?? 0) !== 1) return error("Return request changed while you were updating it. Refresh and try again.", 409);
    return json({ updated: true, status: nextStatus, refund_amount_paisa: current.refund_amount_paisa });
  } catch { return error("Return request could not be updated.", 503); }
}

async function adminOrderRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const collection = url.pathname === "/api/admin/orders";
  const match = url.pathname.match(/^\/api\/admin\/orders\/([a-f0-9-]{36})$/i);
  const deliveryFeeMatch = url.pathname.match(/^\/api\/admin\/orders\/([a-f0-9-]{36})\/delivery-fee$/i);
  if (!collection && !match && !deliveryFeeMatch) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Order management is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "orders"].includes(admin.role)) return error("You do not have permission to manage orders", 403);

  if (collection && request.method === "GET") {
    const limitValue = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50;
    try {
      const result = await env.DB.prepare("SELECT id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, payment_method, payment_provider, payment_status, order_status, delivery_fee_status, delivery_fee_expires_at, customer_note, created_at, updated_at FROM orders ORDER BY created_at DESC LIMIT ?")
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

  if (deliveryFeeMatch && request.method === "POST") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request);
    const deliveryFee = body?.delivery_fee_paisa;
    if (!Number.isSafeInteger(deliveryFee) || Number(deliveryFee) < 0 || Number(deliveryFee) > 100_000_000) return error("Enter a valid delivery fee between Rs. 0 and Rs. 1,000,000.", 400);
    const id = deliveryFeeMatch[1];
    try {
      const current = await env.DB.prepare("SELECT id, order_status, subtotal_paisa FROM orders WHERE id = ? LIMIT 1").bind(id).first<{ id: string; order_status: string; subtotal_paisa: number }>();
      if (!current) return error("Order not found", 404);
      if (!["pending", "confirmed"].includes(current.order_status)) return error("A delivery quotation can only be prepared before fulfilment begins.", 409);
      const total = current.subtotal_paisa + Number(deliveryFee);
      if (!Number.isSafeInteger(total)) return error("The final order total is outside the supported range.", 400);
      const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const tokenHash = await sha256(token);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE orders SET delivery_fee_paisa = ?, total_paisa = ?, delivery_fee_status = 'awaiting_customer', delivery_fee_token_hash = ?, delivery_fee_expires_at = ?, delivery_fee_quote_sent_at = ?, delivery_fee_accepted_at = NULL, updated_at = ? WHERE id = ? AND order_status IN ('pending','confirmed')").bind(Number(deliveryFee), total, tokenHash, expiresAt, now, now, id),
        env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) SELECT ?, ?, 'order.delivery_fee_quoted', 'order', ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND delivery_fee_status = 'awaiting_customer' AND delivery_fee_token_hash = ?)").bind(crypto.randomUUID(), admin.admin_user_id, id, JSON.stringify({ delivery_fee_paisa: Number(deliveryFee), total_paisa: total }), id, tokenHash),
      ]);
      if ((results[0]?.meta?.changes ?? 0) !== 1) return error("Order changed while preparing the quotation. Refresh and try again.", 409);
      return json({ updated: true, delivery_fee_paisa: Number(deliveryFee), total_paisa: total, expires_at: expiresAt, approval_url: url.origin + "/delivery-confirmation?token=" + encodeURIComponent(token) });
    } catch { return error("Delivery quotation could not be prepared.", 503); }
  }
  if (!match || request.method !== "PATCH") return error("Method not allowed", 405);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  const body = await readJson(request);
  const nextStatus = cleanText(body?.order_status, 20);
  const statusNote = cleanText(body?.status_note, 300) || "Order status updated by De VERVE team";
  if (!["confirmed", "processing", "dispatched", "delivered", "cancelled"].includes(nextStatus)) return error("Choose a valid order status", 400);
  const id = match[1];
  try {
    const current = await env.DB.prepare("SELECT id, order_status, payment_provider, payment_status FROM orders WHERE id = ? LIMIT 1").bind(id).first<{ id: string; order_status: string; payment_provider: string; payment_status: string }>();
    if (!current) return error("Order not found", 404);
    if (nextStatus === "cancelled") {
      if (current.payment_status === "paid") return error("This order has an online payment recorded. A refund must be reviewed before cancellation.", 409);
      const activePayment = await env.DB.prepare("SELECT id FROM payment_attempts WHERE order_id = ? AND provider = 'safepay' AND status IN ('created','pending','succeeded') LIMIT 1")
        .bind(id).first<{ id: string }>();
      if (activePayment) return error("This order has an active online payment session. Reconcile or expire the payment before cancelling it.", 409);
    }
    const allowed: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"], confirmed: ["processing", "cancelled"],
      processing: ["dispatched", "cancelled"], dispatched: ["delivered"], delivered: [], cancelled: [],
    };
    if (!allowed[current.order_status]?.includes(nextStatus)) return error("That order status change is not allowed", 409);
    const items = await env.DB.prepare("SELECT id, variant_id, quantity FROM order_items WHERE order_id = ?").bind(id).all<{ id: string; variant_id: string | null; quantity: number }>();
    const lines = items.results ?? [];
    if (!lines.length) return error("This order has no valid line items", 409);
    const guard = nextStatus === "processing"
      ? "orders.delivery_fee_status = 'accepted' AND (orders.payment_provider = 'manual' OR orders.payment_status = 'paid')"
      : nextStatus === "dispatched"
        ? "orders.delivery_fee_status = 'accepted' AND (orders.payment_provider = 'manual' OR orders.payment_status = 'paid') AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = orders.id AND (v.stock_on_hand < oi.quantity OR v.reserved_quantity < oi.quantity))"
        : nextStatus === "cancelled"
        ? "orders.payment_status != 'paid' AND NOT EXISTS (SELECT 1 FROM payment_attempts pa WHERE pa.order_id = orders.id AND pa.provider = 'safepay' AND pa.status IN ('created','pending','succeeded')) AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = orders.id AND v.reserved_quantity < oi.quantity)"
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
    statements.push(env.DB.prepare("INSERT INTO order_status_events (id, order_id, from_status, to_status, actor_type, actor_id, note) SELECT ?, ?, ?, ?, 'admin', ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND order_status = ?)").bind(crypto.randomUUID(), id, current.order_status, nextStatus, admin.admin_user_id, statusNote, id, nextStatus));
    statements.push(env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) SELECT ?, ?, ?, 'order', ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND order_status = ?)")
      .bind(crypto.randomUUID(), admin.admin_user_id, "order.status_changed", id, JSON.stringify({ from: current.order_status, to: nextStatus }), id, nextStatus));
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta?.changes ?? 0) !== 1) return error("Order or reserved stock changed. Refresh the order and try again.", 409);
    return json({ updated: true, order_status: nextStatus });
  } catch { return error("Order status could not be updated", 503); }
}



interface VehicleRow {
  id: string; name: string; vehicle_type: string; transmission: string; seats: number;
  fuel_type: string; daily_rate_paisa: number | null; status: string; image_key: string | null;
  description: string; created_at: string; updated_at: string;
}
interface RentalRequestRow {
  id: string; vehicle_id: string | null; customer_name: string; phone: string; email: string | null;
  pickup_location: string; destination: string | null; pickup_at: string; return_at: string;
  driver_option: string; status: string; customer_note: string; admin_note: string;
  reference_code: string; created_at: string; updated_at: string;
}

async function publicVehicleRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/vehicles" || request.method !== "GET") return null;
  try {
    const result = await env.DB.prepare("SELECT id, name, vehicle_type, transmission, seats, fuel_type, daily_rate_paisa, image_key, description FROM vehicles WHERE status = 'available' ORDER BY vehicle_type, name LIMIT 50").all<VehicleRow>();
    return json({ vehicles: (result.results ?? []).map((vehicle) => ({ ...vehicle, image_url: vehicle.image_key ? "/media/" + vehicle.image_key : null })) });
  } catch { return error("Vehicle catalogue is temporarily unavailable", 503); }
}

async function publicRentalDocumentRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/rentals\/(DV-R-[A-Z0-9-]{12,40})\/documents$/i);
  if (!match || request.method !== "POST") return null;
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  let documentUploadsEnabled = false;
  try {
    const setting = await env.DB.prepare("SELECT setting_value_json FROM store_settings WHERE setting_key = 'cnic_uploads_enabled' LIMIT 1").first<{ setting_value_json: string }>();
    documentUploadsEnabled = setting?.setting_value_json === "true";
  } catch { return error("Secure document settings are temporarily unavailable", 503); }
  if (!documentUploadsEnabled) return error("Secure CNIC uploads are disabled. Our rental team will contact you if identity documents are required.", 503);
  const limited = await enforcePublicRateLimit(request, env, "rental-documents", 3);
  if (limited) return limited;
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 8_500_000) return error("The two CNIC images must be under 8 MB in total", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return error("Upload both CNIC images using the secure form", 400); }
  const token = cleanText(form.get("upload_token"), 100);
  if (!(await verifyTurnstile(request, form.get("turnstile_token")))) return error("Please complete the security check and try again.", 403);
  const front = form.get("cnic_front");
  const back = form.get("cnic_back");
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token) || !(front instanceof File) || !(back instanceof File)) return error("Upload both the front and back of the CNIC", 400);
  const files = [{ side: "cnic_front", file: front }, { side: "cnic_back", file: back }];
  for (const item of files) {
    if (item.file.size < 1 || item.file.size > 4_000_000) return error("Each CNIC image must be no larger than 4 MB", 413);
    if (!["image/jpeg", "image/png", "image/webp"].includes(item.file.type)) return error("CNIC files must be JPG, PNG or WebP images", 415);
  }
  const bytes = await Promise.all(files.map((item) => item.file.arrayBuffer()));
  for (let i = 0; i < files.length; i++) {
    const b = new Uint8Array(bytes[i]);
    const type = files[i].file.type;
    const valid = (type === "image/jpeg" && b[0] === 255 && b[1] === 216 && b[2] === 255)
      || (type === "image/png" && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71)
      || (type === "image/webp" && String.fromCharCode(...b.slice(8, 12)) === "WEBP");
    if (!valid) return error("A CNIC file does not match its declared image type", 415);
  }
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  let rental: { id: string } | null;
  try {
    rental = await env.DB.prepare("SELECT id FROM rental_requests WHERE reference_code = ? AND document_upload_token_hash = ? AND document_upload_expires_at > ? AND status IN ('requested','reviewing','confirmed','active') LIMIT 1")
      .bind(match[1], tokenHash, now).first<{ id: string }>();
  } catch { return error("Secure document upload is temporarily unavailable", 503); }
  if (!rental) return error("This document upload link is invalid, expired or already used", 410);
  const objects: Array<{ id: string; key: string; side: string; file: File }> = [];
  for (const item of files) {
    const ext = item.file.type === "image/jpeg" ? "jpg" : item.file.type === "image/png" ? "png" : "webp";
    const id = crypto.randomUUID();
    const key = "rental-private/" + rental.id + "/" + id + "-" + item.side + "." + ext;
    objects.push({ id, key, side: item.side, file: item.file });
  }
  try {
    for (let i = 0; i < objects.length; i++) {
      await env.MEDIA.put(objects[i].key, bytes[i], { httpMetadata: { contentType: objects[i].file.type }, customMetadata: { rentalRequestId: rental.id, documentSide: objects[i].side } });
    }
    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO rental_documents (id, rental_request_id, document_side, object_key, mime_type, byte_size) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rental_requests WHERE id = ? AND document_upload_token_hash = ? AND document_upload_expires_at > ?)")
        .bind(objects[0].id, rental.id, objects[0].side, objects[0].key, objects[0].file.type, objects[0].file.size, rental.id, tokenHash, now),
      env.DB.prepare("INSERT INTO rental_documents (id, rental_request_id, document_side, object_key, mime_type, byte_size) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rental_requests WHERE id = ? AND document_upload_token_hash = ? AND document_upload_expires_at > ?)")
        .bind(objects[1].id, rental.id, objects[1].side, objects[1].key, objects[1].file.type, objects[1].file.size, rental.id, tokenHash, now),
      env.DB.prepare("UPDATE rental_requests SET document_upload_token_hash = NULL, document_upload_expires_at = NULL, updated_at = ? WHERE id = ? AND document_upload_token_hash = ?")
        .bind(new Date().toISOString(), rental.id, tokenHash),
      env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,NULL,'rental.documents_uploaded','rental_request',?,?)")
        .bind(crypto.randomUUID(), rental.id, JSON.stringify({ document_sides: ["cnic_front", "cnic_back"] })),
    ]);
    if ((results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1 || (results[2]?.meta?.changes ?? 0) !== 1) {
      for (const object of objects) { try { await env.MEDIA.delete(object.key); } catch {} }
      return error("This upload link was already used or has expired. Contact De VERVE for a new secure link.", 410);
    }
    return json({ uploaded: true, message: "Both CNIC images were uploaded securely. Only authorized rental staff can view them." }, 201);
  } catch {
    for (const object of objects) { try { await env.MEDIA.delete(object.key); } catch {} }
    return error("CNIC images could not be stored securely. Please try again.", 503);
  }
}

async function publicRentalRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/rentals" || request.method !== "POST") return null;
  const limited = await enforcePublicRateLimit(request, env, "rental-request", 5);
  if (limited) return limited;
  const body = await readJson(request, 12_000);
  if (!body) return error("Please submit valid rental request details", 400);
  if (cleanText(body.website, 120)) return json({ accepted: true });
  if (!(await verifyTurnstile(request, body.turnstile_token))) return error("Please complete the security check and try again.", 403);
  const name = cleanText(body.customer_name, 100);
  const phone = cleanText(body.phone, 24);
  const email = cleanText(body.email, 160).toLowerCase();
  const vehicleId = cleanText(body.vehicle_id, 64) || null;
  const pickupCity = cleanText(body.pickup_city, 80);
  const pickupAddress = cleanText(body.pickup_address, 300);
  const destinationCity = cleanText(body.destination_city, 80);
  const destinationAddress = cleanText(body.destination_address, 300);
  const pickup = cleanText(pickupAddress + ", " + pickupCity, 420);
  const destination = cleanText(destinationAddress + ", " + destinationCity, 420);
  const pickupAt = cleanText(body.pickup_at, 40);
  const returnAt = cleanText(body.return_at, 40);
  const driver = cleanText(body.driver_option, 20);
  const note = cleanText(body.customer_note, 500);
  const pickupTime = parseRentalDateTime(pickupAt);
  const returnTime = parseRentalDateTime(returnAt);
  if (name.length < 2 || !validPhone(phone) || pickupCity.length < 2 || pickupAddress.length < 8 || destinationCity.length < 2 || destinationAddress.length < 5 || !["self_drive", "with_driver"].includes(driver)) return error("Enter your name, phone, complete pickup and destination addresses, and driver option", 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Enter a valid email address", 400);
  if (!Number.isFinite(pickupTime) || !Number.isFinite(returnTime) || pickupTime <= Date.now() || returnTime <= pickupTime || returnTime - pickupTime > 60 * 86400000) return error("Choose a future pickup and a return time within 60 days", 400);
  if (vehicleId && !/^[a-f0-9-]{36}$/i.test(vehicleId)) return error("Choose a valid vehicle", 400);
  const id = crypto.randomUUID();
  const reference = "DV-R-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + base64Url(crypto.getRandomValues(new Uint8Array(4))).toUpperCase().replace(/[-_]/g, "").slice(0, 6);
  const now = new Date().toISOString();
  let documentUploadsEnabled = false;
  try {
    const setting = await env.DB.prepare("SELECT setting_value_json FROM store_settings WHERE setting_key = 'cnic_uploads_enabled' LIMIT 1").first<{ setting_value_json: string }>();
    documentUploadsEnabled = setting?.setting_value_json === "true";
  } catch { return error("Rental document settings are temporarily unavailable", 503); }
  const uploadToken = documentUploadsEnabled ? base64Url(crypto.getRandomValues(new Uint8Array(32))) : "";
  const uploadTokenHash = documentUploadsEnabled ? await sha256(uploadToken) : null;
  const uploadExpiresAt = documentUploadsEnabled ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
  let signedInCustomer: CustomerSessionRow | null = null;
  try { signedInCustomer = await currentCustomer(request, env.DB); } catch { return error("Customer account service is temporarily unavailable. Please try again.", 503); }
  try {
    const result = await env.DB.prepare("INSERT INTO rental_requests (id, vehicle_id, customer_name, phone, pickup_location, destination, pickup_at, return_at, driver_option, status, email, customer_note, reference_code, updated_at, pickup_city, pickup_address, destination_city, destination_address, document_upload_token_hash, document_upload_expires_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (? IS NULL OR (EXISTS (SELECT 1 FROM vehicles WHERE id = ? AND status = 'available') AND NOT EXISTS (SELECT 1 FROM rental_requests WHERE vehicle_id = ? AND status IN ('confirmed','active') AND pickup_at < ? AND return_at > ?)))")
      .bind(id, vehicleId, name, phone, pickup, destination, new Date(pickupTime).toISOString(), new Date(returnTime).toISOString(), driver, email || null, note, reference, now, pickupCity, pickupAddress, destinationCity, destinationAddress, uploadTokenHash, uploadExpiresAt, vehicleId, vehicleId, vehicleId, new Date(returnTime).toISOString(), new Date(pickupTime).toISOString()).run();
    if ((result.meta?.changes ?? 0) !== 1) return error("That vehicle is not available for the selected dates. Please choose another vehicle or contact us.", 409);
    if (signedInCustomer) await env.DB.prepare("UPDATE rental_requests SET customer_id = ? WHERE id = ? AND customer_id IS NULL").bind(signedInCustomer.customer_id, id).run();
    return json({
      accepted: true,
      reference_code: reference,
      ...(documentUploadsEnabled ? { document_upload_token: uploadToken } : {}),
      message: documentUploadsEnabled
        ? "Your rental request has been received. Availability and terms will be confirmed by De VERVE. Upload CNIC images only if our rental team requests them."
        : "Your rental request has been received. Availability and terms will be confirmed by De VERVE. Please do not send CNIC documents yet; secure uploads are temporarily disabled while our document-retention policy is finalized.",
    }, 201);
  } catch { return error("Rental request could not be submitted. Please contact De VERVE.", 503); }
}

async function adminVehicleRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const collection = url.pathname === "/api/admin/vehicles";
  const match = url.pathname.match(/^\/api\/admin\/vehicles\/([a-f0-9-]{36})$/i);
  if (!collection && !match) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Fleet management is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "rental"].includes(admin.role)) return error("You do not have permission to view the fleet", 403);
  if (collection && request.method === "GET") {
    try {
      const result = await env.DB.prepare("SELECT id, name, vehicle_type, transmission, seats, fuel_type, daily_rate_paisa, status, image_key, description, created_at, updated_at FROM vehicles ORDER BY created_at DESC LIMIT 100").all<VehicleRow>();
      return json({ vehicles: result.results ?? [] });
    } catch { return error("Fleet could not be loaded", 503); }
  }
  if (!["owner", "manager"].includes(admin.role)) return error("Only an owner or manager can change fleet records", 403);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  const body = await readJson(request);
  if (!body) return error("Submit valid vehicle details", 400);
  const name = cleanText(body.name, 100);
  const type = cleanText(body.vehicle_type, 60);
  const transmission = cleanText(body.transmission, 30) || "unspecified";
  const fuel = cleanText(body.fuel_type, 30) || "unspecified";
  const seats = Number(body.seats);
  const rate = body.daily_rate_paisa === null || body.daily_rate_paisa === "" ? null : Number(body.daily_rate_paisa);
  const status = cleanText(body.status, 20) || "draft";
  const description = cleanText(body.description, 1000);
  const imageId = body.image_key ? cleanText(body.image_key, 64) : null;
  if (name.length < 2 || type.length < 2 || !Number.isInteger(seats) || seats < 1 || seats > 30 || (rate !== null && (!Number.isSafeInteger(rate) || rate < 0)) || !["draft", "available", "maintenance", "retired"].includes(status)) return error("Check the vehicle name, type, seats, daily rate and status", 400);
  if (imageId && !/^[a-f0-9-]{36}$/i.test(imageId)) return error("Choose a valid vehicle image", 400);
  if (request.method === "POST" && collection) {
    const id = crypto.randomUUID();
    try {
      if (imageId) {
        const media = await env.DB.prepare("SELECT id FROM media_assets WHERE id = ? AND media_type = 'image' AND status = 'ready' LIMIT 1").bind(imageId).first<{ id: string }>();
        if (!media) return error("Vehicle image not found", 404);
      }
      await env.DB.prepare("INSERT INTO vehicles (id, name, vehicle_type, transmission, seats, fuel_type, daily_rate_paisa, status, image_key, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, name, type, transmission, seats, fuel, rate, status, imageId, description).run();
      await env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, 'vehicle.created', 'vehicle', ?, ?)")
        .bind(crypto.randomUUID(), admin.admin_user_id, id, JSON.stringify({ status, vehicle_type: type })).run();
      return json({ created: true, vehicle_id: id }, 201);
    } catch { return error("Vehicle could not be saved", 503); }
  }
  if (!match || request.method !== "PATCH") return error("Method not allowed", 405);
  try {
    if (imageId) {
      const media = await env.DB.prepare("SELECT id FROM media_assets WHERE id = ? AND media_type = 'image' AND status = 'ready' LIMIT 1").bind(imageId).first<{ id: string }>();
      if (!media) return error("Vehicle image not found", 404);
    }
    const result = await env.DB.prepare("UPDATE vehicles SET name = ?, vehicle_type = ?, transmission = ?, seats = ?, fuel_type = ?, daily_rate_paisa = ?, status = ?, image_key = ?, description = ?, updated_at = ? WHERE id = ? AND (? = 'available' OR NOT EXISTS (SELECT 1 FROM rental_requests WHERE vehicle_id = vehicles.id AND status IN ('confirmed','active')))")
      .bind(name, type, transmission, seats, fuel, rate, status, imageId, description, new Date().toISOString(), match[1], status).run();
    if ((result.meta?.changes ?? 0) !== 1) return error("Vehicle not found or it has a confirmed or active rental and cannot be taken out of service.", 409);
    await env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, 'vehicle.updated', 'vehicle', ?, ?)")
      .bind(crypto.randomUUID(), admin.admin_user_id, match[1], JSON.stringify({ status, vehicle_type: type })).run();
    return json({ updated: true });
  } catch { return error("Vehicle could not be updated", 503); }
}

async function adminRentalDocumentRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/admin\/rentals\/([a-f0-9-]{36})\/documents\/(cnic_front|cnic_back)$/i);
  if (!match) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); } catch { return error("Rental document service is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "rental"].includes(admin.role)) return error("You do not have permission to view rental documents", 403);
  if (request.method === "GET") {
    try {
      const doc = await env.DB.prepare("SELECT object_key, mime_type, document_side FROM rental_documents WHERE rental_request_id = ? AND document_side = ? LIMIT 1")
        .bind(match[1], match[2]).first<{ object_key: string; mime_type: string; document_side: string }>();
      if (!doc) return error("Rental document not found", 404);
      const object = await env.MEDIA.get(doc.object_key);
      if (!object) return error("Rental document not found", 404);
      return new Response(object.body, { headers: { "content-type": doc.mime_type, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-disposition": "attachment; filename=\"" + doc.document_side + (doc.mime_type === "image/png" ? ".png" : doc.mime_type === "image/webp" ? ".webp" : ".jpg") + "\"" } });
    } catch { return error("Rental document could not be loaded", 503); }
  }
  if (request.method === "DELETE") {
    if (!["owner", "manager"].includes(admin.role)) return error("Only an owner or manager can delete rental documents", 403);
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    try {
      const doc = await env.DB.prepare("SELECT id, object_key FROM rental_documents WHERE rental_request_id = ? AND document_side = ? LIMIT 1")
        .bind(match[1], match[2]).first<{ id: string; object_key: string }>();
      if (!doc) return error("Rental document not found", 404);
      try { await env.MEDIA.delete(doc.object_key); } catch { return error("The private file could not be deleted. The document record was kept so an owner can safely retry.", 503); }
      await env.DB.prepare("DELETE FROM rental_documents WHERE id = ?").bind(doc.id).run();
      await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'rental.document_deleted','rental_request',?,?)")
        .bind(crypto.randomUUID(), admin.admin_user_id, match[1], JSON.stringify({ side: match[2] })).run();
      return json({ deleted: true });
    } catch { return error("Rental document could not be deleted", 503); }
  }
  return error("Method not allowed", 405);
}

async function adminRentalRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const collection = url.pathname === "/api/admin/rentals";
  const match = url.pathname.match(/^\/api\/admin\/rentals\/([a-f0-9-]{36})$/i);
  if (!collection && !match) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Rental management is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "rental"].includes(admin.role)) return error("You do not have permission to manage rentals", 403);
  if (collection && request.method === "GET") {
    try {
      const result = await env.DB.prepare("SELECT r.id, r.vehicle_id, r.customer_name, r.phone, r.email, r.pickup_location, r.destination, r.pickup_city, r.pickup_address, r.destination_city, r.destination_address, r.pickup_at, r.return_at, r.driver_option, r.status, r.customer_note, r.admin_note, r.reference_code, r.created_at, r.updated_at, v.name AS vehicle_name, v.vehicle_type, EXISTS (SELECT 1 FROM rental_documents d WHERE d.rental_request_id=r.id AND d.document_side='cnic_front') AS cnic_front_uploaded, EXISTS (SELECT 1 FROM rental_documents d WHERE d.rental_request_id=r.id AND d.document_side='cnic_back') AS cnic_back_uploaded FROM rental_requests r LEFT JOIN vehicles v ON v.id = r.vehicle_id ORDER BY r.created_at DESC LIMIT 100").all<RentalRequestRow & { vehicle_name: string | null; vehicle_type: string | null }>();
      return json({ rentals: result.results ?? [] });
    } catch { return error("Rental requests could not be loaded", 503); }
  }
  if (!match || request.method !== "PATCH") return error("Method not allowed", 405);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  const body = await readJson(request);
  const nextStatus = cleanText(body?.status, 20);
  const adminNote = cleanText(body?.admin_note, 500);
  const requestedVehicle = body?.vehicle_id;
  if (!["reviewing", "confirmed", "active", "completed", "cancelled"].includes(nextStatus)) return error("Choose a valid rental status", 400);
  if (requestedVehicle !== undefined && requestedVehicle !== null && (typeof requestedVehicle !== "string" || !/^[a-f0-9-]{36}$/i.test(requestedVehicle))) return error("Choose a valid vehicle", 400);
  try {
    const current = await env.DB.prepare("SELECT id, vehicle_id, pickup_at, return_at, status FROM rental_requests WHERE id = ? LIMIT 1").bind(match[1]).first<{ id: string; vehicle_id: string | null; pickup_at: string; return_at: string; status: string }>();
    if (!current) return error("Rental request not found", 404);
    const allowed: Record<string, string[]> = {
      requested: ["reviewing", "cancelled"], reviewing: ["confirmed", "cancelled"],
      confirmed: ["active", "cancelled"], active: ["completed", "cancelled"], completed: [], cancelled: [],
    };
    if (!allowed[current.status]?.includes(nextStatus)) return error("That rental status change is not allowed", 409);
    const targetVehicleId = requestedVehicle === undefined ? current.vehicle_id : requestedVehicle;
    if (targetVehicleId) {
      const vehicle = await env.DB.prepare("SELECT id, status FROM vehicles WHERE id = ? LIMIT 1").bind(targetVehicleId).first<{ id: string; status: string }>();
      if (!vehicle || (nextStatus === "confirmed" && vehicle.status !== "available")) return error("Choose a vehicle that is currently available", 409);
    }
    const now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE rental_requests SET vehicle_id = ?, status = ?, admin_note = ?, updated_at = ? WHERE id = ? AND status = ? AND (? <> 'confirmed' OR (? IS NOT NULL AND EXISTS (SELECT 1 FROM vehicles WHERE id = ? AND status = 'available') AND NOT EXISTS (SELECT 1 FROM rental_requests other WHERE other.vehicle_id = ? AND other.id <> rental_requests.id AND other.status IN ('confirmed','active') AND other.pickup_at < rental_requests.return_at AND other.return_at > rental_requests.pickup_at)))")
      .bind(targetVehicleId, nextStatus, adminNote, now, match[1], current.status, nextStatus, targetVehicleId, targetVehicleId, targetVehicleId).run();
    if ((result.meta?.changes ?? 0) !== 1) return error("The vehicle is unavailable for these dates, or the request changed. Refresh and try again.", 409);
    await env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, 'rental.status_changed', 'rental_request', ?, ?)")
      .bind(crypto.randomUUID(), admin.admin_user_id, match[1], JSON.stringify({ from: current.status, to: nextStatus })).run();
    return json({ updated: true, status: nextStatus });
  } catch { return error("Rental status could not be updated", 503); }
}

interface WholesaleQuoteRow {
  id: string; enquiry_id: string | null; business_name: string; contact_name: string; phone: string;
  email: string | null; requested_items: string; quoted_total_paisa: number | null; status: string;
  valid_until: string | null; delivery_address: string; city: string; customer_note: string;
  approval_token: string | null; converted_order_id: string | null; created_at: string; updated_at: string;
}
interface WholesaleQuoteItemRow {
  id: string; quote_id: string; variant_id: string | null; product_name_snapshot: string;
  sku_snapshot: string | null; size_snapshot: string; color_snapshot: string;
  quantity: number; unit_price_paisa: number; line_total_paisa: number;
}
interface WholesaleVariantRow {
  id: string; product_id: string; name: string; sku: string | null; size: string; color: string;
  wholesale_price_paisa: number | null; retail_price_paisa: number | null; stock_on_hand: number; reserved_quantity: number;
}

async function adminWholesaleQuoteRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const collection = url.pathname === "/api/admin/wholesale-quotes";
  const match = url.pathname.match(/^\/api\/admin\/wholesale-quotes\/([a-f0-9-]{36})$/i);
  if (!collection && !match) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Wholesale quotations are temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "orders"].includes(admin.role)) return error("You do not have permission to manage wholesale quotations", 403);

  if (collection && request.method === "GET") {
    try {
      const result = await env.DB.prepare("SELECT id, enquiry_id, business_name, contact_name, phone, email, requested_items, quoted_total_paisa, status, valid_until, delivery_address, city, customer_note, approval_token, converted_order_id, created_at, updated_at FROM wholesale_quotes ORDER BY created_at DESC LIMIT 100").all<WholesaleQuoteRow>();
      const quotes = result.results ?? [];
      if (!quotes.length) return json({ quotes: [] });
      const ids = quotes.map((quote) => quote.id);
      const items = await env.DB.prepare("SELECT id, quote_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id IN (" + ids.map(() => "?").join(",") + ") ORDER BY rowid").bind(...ids).all<WholesaleQuoteItemRow>();
      const grouped = new Map<string, WholesaleQuoteItemRow[]>();
      for (const item of items.results ?? []) grouped.set(item.quote_id, [...(grouped.get(item.quote_id) ?? []), item]);
      return json({ quotes: quotes.map((quote) => ({ ...quote, items: grouped.get(quote.id) ?? [], approval_url: quote.approval_token ? "/wholesale/quote/" + quote.approval_token : null })) });
    } catch { return error("Wholesale quotations could not be loaded", 503); }
  }

  if (collection && request.method === "POST") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request, 20_000);
    if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) return error("Add between 1 and 30 quotation items", 400);
    const businessName = cleanText(body.business_name, 120);
    const contactName = cleanText(body.contact_name, 100);
    const phone = cleanText(body.phone, 24);
    const email = cleanText(body.email, 160).toLowerCase();
    const address = cleanText(body.delivery_address, 300);
    const city = cleanText(body.city, 80);
    const note = cleanText(body.customer_note, 500);
    const enquiryId = cleanText(body.enquiry_id, 64) || null;
    if (businessName.length < 2 || contactName.length < 2 || !validPhone(phone) || address.length < 8 || city.length < 2) return error("Check the business, contact, phone, delivery address and city details", 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Enter a valid email address", 400);
    if (enquiryId && !/^[a-f0-9-]{36}$/i.test(enquiryId)) return error("Choose a valid enquiry", 400);
    const validUntil = cleanText(body.valid_until, 32) || new Date(Date.now() + 7 * 86400000).toISOString();
    if (!Number.isFinite(Date.parse(validUntil)) || Date.parse(validUntil) <= Date.now()) return error("Quotation expiry must be a future date", 400);
    const lines: Array<{ variant: WholesaleVariantRow; quantity: number; unitPrice: number; lineTotal: number }> = [];
    const quantities = new Map<string, number>();
    let total = 0;
    try {
      for (const raw of body.items) {
        if (!raw || typeof raw !== "object") return error("A quotation item is invalid", 400);
        const item = raw as Record<string, unknown>;
        const variantId = cleanText(item.variant_id, 64);
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unit_price_paisa);
        if (!/^[a-f0-9-]{36}$/i.test(variantId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || !Number.isSafeInteger(unitPrice) || unitPrice < 0) return error("Check each item, quantity and wholesale price", 400);
        if (quantities.has(variantId)) return error("Combine repeated product options into a single quotation line", 400);
        quantities.set(variantId, quantity);
        if ((quantities.get(variantId) ?? 0) > 10000) return error("Combined quantity for an item is too high", 400);
      }
      for (const [variantId, quantity] of quantities) {
        const variant = await env.DB.prepare("SELECT v.id, v.product_id, v.sku, v.size, v.color, v.stock_on_hand, v.reserved_quantity, p.name, p.wholesale_price_paisa, p.retail_price_paisa FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.is_active = 1 AND p.status = 'published' LIMIT 1").bind(variantId).first<WholesaleVariantRow>();
        if (!variant) return error("A selected product option is no longer available", 409);
        if (variant.stock_on_hand - variant.reserved_quantity < quantity) return error("There is not enough available stock for one of the requested quantities", 409);
        const supplied = (body.items as Array<Record<string, unknown>>).find((x) => cleanText(x?.variant_id, 64) === variantId);
        const unitPrice = Number(supplied?.unit_price_paisa);
        if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) return error("A wholesale price is invalid", 400);
        const lineTotal = unitPrice * quantity;
        if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) return error("Quotation total is outside the supported range", 400);
        total += lineTotal;
        lines.push({ variant, quantity, unitPrice, lineTotal });
      }
      const id = crypto.randomUUID();
      const token = crypto.randomUUID();
      const now = new Date().toISOString();
      const statements = [
        env.DB.prepare("INSERT INTO wholesale_quotes (id, enquiry_id, business_name, contact_name, phone, email, requested_items, quoted_total_paisa, status, valid_until, delivery_address, city, customer_note, approval_token, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?, ?, ?, ?, ?)")
          .bind(id, enquiryId, businessName, contactName, phone, email || null, JSON.stringify(lines.map((line) => ({ product: line.variant.name, sku: line.variant.sku, size: line.variant.size, color: line.variant.color, quantity: line.quantity }))), total, validUntil, address, city, note, token, now),
      ];
      for (const line of lines) statements.push(env.DB.prepare("INSERT INTO wholesale_quote_items (id, quote_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM wholesale_quotes WHERE id = ?)").bind(crypto.randomUUID(), id, line.variant.id, line.variant.name, line.variant.sku, line.variant.size, line.variant.color, line.quantity, line.unitPrice, line.lineTotal, id));
      statements.push(env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, 'wholesale_quote.created', 'wholesale_quote', ?, ?)").bind(crypto.randomUUID(), admin.admin_user_id, id, JSON.stringify({ item_count: lines.length, total_paisa: total })));
      const results = await env.DB.batch(statements);
      if ((results[0]?.meta?.changes ?? 0) !== 1) return error("Quotation could not be saved", 409);
      return json({ created: true, quote_id: id, status: "prepared", quoted_total_paisa: total, approval_url: "/wholesale/quote/" + token }, 201);
    } catch (caught) { console.error("[wholesale_quote_create] failed", caught instanceof Error ? caught.message : "unknown error"); return error("Wholesale quotation could not be saved", 503); }
  }

  if (!match || request.method !== "PATCH") return error("Method not allowed", 405);
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  const body = await readJson(request);
  const nextStatus = cleanText(body?.status, 20);
  if (!["sent", "expired"].includes(nextStatus)) return error("Only prepared quotations can be sent or expired", 400);
  try {
    const current = await env.DB.prepare("SELECT id, status, valid_until, approval_token FROM wholesale_quotes WHERE id = ? LIMIT 1").bind(match[1]).first<{ id: string; status: string; valid_until: string | null; approval_token: string | null }>();
    if (!current) return error("Quotation not found", 404);
    if (nextStatus === "sent" && (current.status !== "prepared" || !current.approval_token || (current.valid_until && Date.parse(current.valid_until) <= Date.now()))) return error("This quotation cannot be sent. Check its status and expiry.", 409);
    if (nextStatus === "expired" && !["prepared", "sent"].includes(current.status)) return error("This quotation cannot be expired", 409);
    const result = await env.DB.prepare("UPDATE wholesale_quotes SET status = ?, updated_at = ? WHERE id = ? AND status = ?").bind(nextStatus, new Date().toISOString(), match[1], current.status).run();
    if ((result.meta?.changes ?? 0) !== 1) return error("Quotation changed. Refresh and try again.", 409);
    await env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, 'wholesale_quote.status_changed', 'wholesale_quote', ?, ?)").bind(crypto.randomUUID(), admin.admin_user_id, match[1], JSON.stringify({ from: current.status, to: nextStatus })).run();
    return json({ updated: true, status: nextStatus, approval_url: "/wholesale/quote/" + current.approval_token });
  } catch { return error("Quotation status could not be updated", 503); }
}

async function publicWholesaleQuoteRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/wholesale-quotes\/([a-f0-9-]{36})(?:\/(accept|decline))?$/i);
  if (!match) return null;
  const token = match[1];
  const action = match[2] ?? null;
  try {
    const quote = await env.DB.prepare("SELECT id, business_name, contact_name, phone, email, delivery_address, requested_items, quoted_total_paisa, status, valid_until, city, approval_token, converted_order_id FROM wholesale_quotes WHERE approval_token = ? LIMIT 1").bind(token).first<{ id: string; business_name: string; contact_name: string; phone: string; email: string | null; delivery_address: string; requested_items: string; quoted_total_paisa: number | null; status: string; valid_until: string | null; city: string; approval_token: string; converted_order_id: string | null }>();
    if (!quote) return error("Quotation not found", 404);
    if (quote.status === "accepted" && quote.converted_order_id) {
      const order = await env.DB.prepare("SELECT order_number, total_paisa, order_status FROM orders WHERE id = ? LIMIT 1").bind(quote.converted_order_id).first<{ order_number: string; total_paisa: number; order_status: string; payment_provider: string }>();
      const acceptedItems = await env.DB.prepare("SELECT product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id = ? ORDER BY rowid").bind(quote.id).all<Omit<WholesaleQuoteItemRow, "id" | "quote_id" | "variant_id">>();
      return json({ quote: { business_name: quote.business_name, contact_name: quote.contact_name, items: acceptedItems.results ?? [], quoted_total_paisa: quote.quoted_total_paisa, status: quote.status, valid_until: quote.valid_until, city: quote.city }, accepted: true, order });
    }
    if (["declined", "expired"].includes(quote.status)) {
      const closedItems = await env.DB.prepare("SELECT product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id = ? ORDER BY rowid").bind(quote.id).all<Omit<WholesaleQuoteItemRow, "id" | "quote_id" | "variant_id">>();
      return json({ quote: { business_name: quote.business_name, contact_name: quote.contact_name, items: closedItems.results ?? [], quoted_total_paisa: quote.quoted_total_paisa, status: quote.status, valid_until: quote.valid_until, city: quote.city } });
    }
    if (quote.status !== "sent") return error("This quotation is not open for approval", 409);
    if (quote.valid_until && Date.parse(quote.valid_until) <= Date.now()) {
      await env.DB.prepare("UPDATE wholesale_quotes SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'sent'").bind(new Date().toISOString(), quote.id).run();
      const expiredItems = await env.DB.prepare("SELECT product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id = ? ORDER BY rowid").bind(quote.id).all<Omit<WholesaleQuoteItemRow, "id" | "quote_id" | "variant_id">>();
      return json({ quote: { business_name: quote.business_name, contact_name: quote.contact_name, items: expiredItems.results ?? [], quoted_total_paisa: quote.quoted_total_paisa, status: "expired", valid_until: quote.valid_until, city: quote.city } });
    }
    const items = await env.DB.prepare("SELECT product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id = ? ORDER BY rowid").bind(quote.id).all<Omit<WholesaleQuoteItemRow, "id" | "quote_id" | "variant_id">>();
    if (!action && request.method !== "GET") return error("Method not allowed", 405);
    if (!action) return json({ quote: { business_name: quote.business_name, contact_name: quote.contact_name, items: items.results ?? [], quoted_total_paisa: quote.quoted_total_paisa, status: quote.status, valid_until: quote.valid_until, city: quote.city } });
    if (request.method !== "POST") return error("Method not allowed", 405);
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    if (action === "decline") {
      const result = await env.DB.prepare("UPDATE wholesale_quotes SET status = 'declined', updated_at = ? WHERE id = ? AND status = 'sent'").bind(new Date().toISOString(), quote.id).run();
      if ((result.meta?.changes ?? 0) !== 1) return error("Quotation status changed. Refresh and try again.", 409);
      return json({ declined: true });
    }
    if (action !== "accept") return error("Unsupported action", 404);
    const lines = await env.DB.prepare("SELECT variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id = ? ORDER BY rowid").bind(quote.id).all<WholesaleQuoteItemRow>();
    const quoteLines = lines.results ?? [];
    if (!quoteLines.length || quoteLines.some((line) => !line.variant_id)) return error("Some quoted items are no longer available. Please contact De VERVE.", 409);
    const orderId = crypto.randomUUID();
    const orderNumber = "DV-W-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + base64Url(crypto.getRandomValues(new Uint8Array(5))).toUpperCase().replace(/[-_]/g, "").slice(0, 7);
    const now = new Date().toISOString();
    const conditions = quoteLines.map(() => "EXISTS (SELECT 1 FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.is_active = 1 AND p.status = 'published' AND v.stock_on_hand - v.reserved_quantity >= ?)").join(" AND ");
    const orderValues: unknown[] = [orderId, orderNumber, quote.contact_name, quote.phone, quote.email, quote.delivery_address, quote.city, quote.quoted_total_paisa ?? 0, 0, quote.quoted_total_paisa ?? 0, "Wholesale quotation accepted: " + quote.id, quote.id];
    const stockChecks: unknown[] = [];
    for (const line of quoteLines) stockChecks.push(line.variant_id, line.quantity);
    const statements = [env.DB.prepare("INSERT INTO orders (id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, customer_note, source_quote_id) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM wholesale_quotes WHERE id = ? AND status = 'sent' AND (valid_until IS NULL OR valid_until > ?)) AND " + conditions).bind(...orderValues, quote.id, now, ...stockChecks)];
    for (const line of quoteLines) {
      statements.push(env.DB.prepare("UPDATE product_variants SET reserved_quantity = reserved_quantity + ?, updated_at = ? WHERE id = ? AND is_active = 1 AND stock_on_hand - reserved_quantity >= ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND source_quote_id = ?)").bind(line.quantity, now, line.variant_id, line.quantity, orderId, quote.id));
      statements.push(env.DB.prepare("INSERT INTO order_items (id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND source_quote_id = ?)").bind(crypto.randomUUID(), orderId, line.variant_id, line.product_name_snapshot, line.sku_snapshot, line.size_snapshot, line.color_snapshot, line.quantity, line.unit_price_paisa, line.line_total_paisa, orderId, quote.id));
    }
    statements.push(env.DB.prepare("UPDATE wholesale_quotes SET status = 'accepted', converted_order_id = ?, updated_at = ? WHERE id = ? AND status = 'sent' AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND source_quote_id = ?)").bind(orderId, now, quote.id, orderId, quote.id));
    statements.push(env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) SELECT ?, NULL, 'wholesale_quote.accepted', 'wholesale_quote', ?, ? WHERE EXISTS (SELECT 1 FROM wholesale_quotes WHERE id = ? AND status = 'accepted')").bind(crypto.randomUUID(), quote.id, JSON.stringify({ order_id: orderId, order_number: orderNumber }), quote.id));
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta?.changes ?? 0) !== 1) {
      const existing = await env.DB.prepare("SELECT order_number, total_paisa, order_status FROM orders WHERE source_quote_id = ? LIMIT 1").bind(quote.id).first<{ order_number: string; total_paisa: number; order_status: string; payment_provider: string }>();
      if (existing) return json({ accepted: true, duplicate: true, order: existing });
      return error("Stock changed or this quotation is no longer open. Please contact De VERVE.", 409);
    }
    return json({ accepted: true, order: { order_number: orderNumber, total_paisa: quote.quoted_total_paisa ?? 0, order_status: "pending" } }, 201);
  } catch (caught) { console.error("[wholesale_quote_approval] failed", caught instanceof Error ? caught.message : "unknown error"); return error("Quotation approval could not be processed. Please contact De VERVE.", 503); }
}

interface MediaAssetRow {
  id: string; object_key: string; media_type: string; mime_type: string; byte_size: number;
  alt_text: string; caption: string; status: string; created_at: string;
}

async function adminProductMediaRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const collection = url.pathname.match(/^\/api\/admin\/products\/([a-f0-9-]{36})\/media$/i);
  const asset = url.pathname.match(/^\/api\/admin\/products\/([a-f0-9-]{36})\/media\/([a-f0-9-]{36})$/i);
  if (!collection && !asset) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Product media service is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "catalogue"].includes(admin.role)) return error("You do not have permission to manage product media", 403);
  if (request.method === "GET" && collection) {
    try {
      const rows = await env.DB.prepare("SELECT a.id, a.media_type, a.mime_type, a.byte_size, a.alt_text, a.caption, a.status, pm.position, pm.is_primary FROM product_media_assets pm JOIN media_assets a ON a.id = pm.media_asset_id WHERE pm.product_id = ? AND a.status = 'ready' ORDER BY pm.position, a.created_at")
        .bind(collection[1]).all<Record<string, unknown>>();
      return json({ media: (rows.results ?? []).map((row) => ({ ...row, url: "/api/admin/media/" + row.id + "/file" })) });
    } catch { return error("Product media could not be loaded", 503); }
  }
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  if (request.method === "POST" && collection) {
    const body = await readJson(request);
    const mediaId = cleanText(body?.media_id, 64);
    const isPrimary = body?.is_primary === true;
    const position = body?.position === undefined ? 0 : Number(body.position);
    if (!body || !/^[a-f0-9-]{36}$/i.test(mediaId) || !Number.isInteger(position) || position < 0 || position > 100) return error("Choose valid media and position values", 400);
    try {
      const media = await env.DB.prepare("SELECT id, media_type FROM media_assets WHERE id = ? AND status = 'ready' AND media_type IN ('image','video') LIMIT 1").bind(mediaId).first<{ id: string; media_type: string }>();
      if (!media) return error("Media item not found or unavailable", 404);
      if (isPrimary && media.media_type !== "image") return error("Only an image can be the product cover", 400);
      const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? LIMIT 1").bind(collection[1]).first<{ id: string }>();
      if (!product) return error("Product not found", 404);
      const statements = [];
      if (isPrimary) statements.push(env.DB.prepare("UPDATE product_media_assets SET is_primary = 0 WHERE product_id = ?").bind(collection[1]));
      statements.push(env.DB.prepare("INSERT INTO product_media_assets (product_id, media_asset_id, position, is_primary) VALUES (?, ?, ?, ?) ON CONFLICT(product_id, media_asset_id) DO UPDATE SET position = excluded.position, is_primary = excluded.is_primary")
        .bind(collection[1], mediaId, position, isPrimary ? 1 : 0));
      if (isPrimary) statements.push(env.DB.prepare("UPDATE products SET image_key = ?, updated_at = ? WHERE id = ?").bind(mediaId, new Date().toISOString(), collection[1]));
      statements.push(env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, 'product.media_attached', 'product', ?, ?)")
        .bind(crypto.randomUUID(), admin.admin_user_id, collection[1], JSON.stringify({ media_id: mediaId, media_type: media.media_type, is_primary: isPrimary, position })));
      await env.DB.batch(statements);
      return json({ attached: true, media_id: mediaId, is_primary: isPrimary }, 201);
    } catch { return error("Media could not be attached to this product", 503); }
  }
  if (request.method === "DELETE" && asset) {
    try {
      const removed = await env.DB.prepare("DELETE FROM product_media_assets WHERE product_id = ? AND media_asset_id = ?").bind(asset[1], asset[2]).run();
      if ((removed.meta?.changes ?? 0) !== 1) return error("Product media item not found", 404);
      await env.DB.batch([
        env.DB.prepare("UPDATE product_media_assets SET is_primary = 1 WHERE product_id = ? AND media_asset_id = (SELECT pm.media_asset_id FROM product_media_assets pm JOIN media_assets a ON a.id = pm.media_asset_id WHERE pm.product_id = ? AND a.media_type = 'image' ORDER BY pm.position, a.created_at LIMIT 1) AND NOT EXISTS (SELECT 1 FROM product_media_assets WHERE product_id = ? AND is_primary = 1)").bind(asset[1], asset[1], asset[1]),
        env.DB.prepare("UPDATE products SET image_key = (SELECT pm.media_asset_id FROM product_media_assets pm JOIN media_assets a ON a.id = pm.media_asset_id WHERE pm.product_id = products.id AND pm.is_primary = 1 AND a.media_type = 'image' LIMIT 1), updated_at = ? WHERE id = ?").bind(new Date().toISOString(), asset[1]),
        env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, 'product.media_removed', 'product', ?, ?)")
          .bind(crypto.randomUUID(), admin.admin_user_id, asset[1], JSON.stringify({ media_id: asset[2] })),
      ]);
      return json({ removed: true });
    } catch { return error("Product media could not be removed", 503); }
  }
  return error("Method not allowed", 405);
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
    if (length > 22_000_000) return error("Media upload is too large. Maximum video size is 20 MB.", 413);
    let form: FormData;
    try { form = await request.formData(); } catch { return error("Upload a valid image or video file", 400); }
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1) return error("Choose a valid media file", 400);
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" };
    const ext = extensions[file.type];
    const isVideo = file.type.startsWith("video/");
    const maxBytes = isVideo ? 20_000_000 : 5_000_000;
    if (!ext || file.size > maxBytes) return error(isVideo ? "Choose an MP4 or WebM video up to 20 MB" : "Choose a JPG, PNG or WebP image up to 5 MB", 415);
    const bytes = await file.arrayBuffer();
    const b = new Uint8Array(bytes);
    const signature = (file.type === "image/jpeg" && b[0] === 255 && b[1] === 216 && b[2] === 255)
      || (file.type === "image/png" && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71)
      || (file.type === "image/webp" && String.fromCharCode(...b.slice(8, 12)) === "WEBP")
      || (file.type === "video/mp4" && b.length >= 12 && String.fromCharCode(...b.slice(4, 8)) === "ftyp")
      || (file.type === "video/webm" && b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3);
    if (!signature) return error("The file content does not match its declared media type", 415);
    const id = crypto.randomUUID();
    const key = "catalogue/" + id + "." + ext;
    const altText = cleanText(form.get("alt_text"), 240);
    const caption = cleanText(form.get("caption"), 500);
    const mediaType = isVideo ? "video" : "image";
    try {
      await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { assetId: id } });
      await env.DB.prepare("INSERT INTO media_assets (id, object_key, media_type, mime_type, byte_size, alt_text, caption, status, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)")
        .bind(id, key, mediaType, file.type, file.size, altText, caption, admin.admin_user_id).run();
      await env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), admin.admin_user_id, "media.uploaded", "media_asset", id, JSON.stringify({ mime_type: file.type, byte_size: file.size })).run();
      return json({ uploaded: true, media: { id, media_type: mediaType, mime_type: file.type, byte_size: file.size, alt_text: altText, caption, status: "ready", url: "/api/admin/media/" + id + "/file" } }, 201);
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
      const used = await env.DB.prepare("SELECT id FROM products WHERE image_key = ? UNION ALL SELECT product_id AS id FROM product_media_assets WHERE media_asset_id = ? UNION ALL SELECT id FROM vehicles WHERE image_key = ? LIMIT 1").bind(assetMatch[1], assetMatch[1], assetMatch[1]).first<{ id: string }>();
      if (used) return error("This media item is assigned to a product. Remove it from the product gallery before archiving.", 409);
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
    const statements = [env.DB.prepare("UPDATE product_media_assets SET is_primary = 0 WHERE product_id = ?").bind(match[1])];
    if (body.image_id) statements.push(env.DB.prepare("INSERT INTO product_media_assets (product_id, media_asset_id, position, is_primary) VALUES (?, ?, COALESCE((SELECT MAX(position)+1 FROM product_media_assets WHERE product_id=?),0), 1) ON CONFLICT(product_id,media_asset_id) DO UPDATE SET is_primary=1")
      .bind(match[1], body.image_id, match[1]));
    statements.push(env.DB.prepare("UPDATE products SET image_key = ?, updated_at = ? WHERE id = ?").bind(body.image_id, new Date().toISOString(), match[1]));
    statements.push(env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), admin.admin_user_id, "product.image_changed", "product", match[1], JSON.stringify({ image_id: body.image_id })));
    await env.DB.batch(statements);
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
  reserved_quantity: number;
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
      const rows = await env.DB.prepare("SELECT id, product_id, sku, size, color, stock_on_hand, reserved_quantity, is_active, created_at, updated_at FROM product_variants WHERE product_id = ? ORDER BY size, color, sku")
        .bind(productId).all<AdminVariantRow>();
      return json({ variants: (rows.results ?? []).map((variant) => ({ ...variant, available_quantity: Math.max(0, variant.stock_on_hand - variant.reserved_quantity) })) });
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


async function adminCustomerRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/admin/customers") return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Customer directory is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (!["owner", "manager", "orders"].includes(admin.role)) return error("You do not have permission to view customer records", 403);
  if (request.method !== "GET") return error("Method not allowed", 405);

  const search = cleanText(url.searchParams.get("search"), 80);
  const limitValue = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 100;
  const pattern = "%" + search + "%";
  try {
    const rows = search
      ? await env.DB.prepare("SELECT c.id, c.full_name, c.email, c.phone, c.status, c.email_verified_at, c.created_at, c.last_login_at, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count, (SELECT COALESCE(SUM(o.total_paisa),0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'paid') AS paid_total_paisa, (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order_at, (SELECT COUNT(*) FROM rental_requests rr WHERE rr.customer_id = c.id) AS rental_count FROM customers c WHERE c.full_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? ORDER BY c.created_at DESC LIMIT ?")
          .bind(pattern, pattern, pattern, limit).all<Record<string, unknown>>()
      : await env.DB.prepare("SELECT c.id, c.full_name, c.email, c.phone, c.status, c.email_verified_at, c.created_at, c.last_login_at, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count, (SELECT COALESCE(SUM(o.total_paisa),0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'paid') AS paid_total_paisa, (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order_at, (SELECT COUNT(*) FROM rental_requests rr WHERE rr.customer_id = c.id) AS rental_count FROM customers c ORDER BY c.created_at DESC LIMIT ?")
          .bind(limit).all<Record<string, unknown>>();
    return json({ customers: rows.results ?? [], total_returned: rows.results?.length ?? 0, search_applied: Boolean(search) });
  } catch {
    return error("Customer records could not be loaded", 503);
  }
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



async function adminAuditLogRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/admin/audit-logs") return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); }
  catch { return error("Audit history is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (admin.role !== "owner") return error("Only the owner can view the audit history", 403);
  if (request.method !== "GET") return error("Method not allowed", 405);
  const limitValue = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 100;
  try {
    const rows = await env.DB.prepare("SELECT l.id, l.action, l.entity_type, l.entity_id, l.metadata_json, l.created_at, u.email AS actor_email FROM audit_logs l LEFT JOIN admin_users u ON u.id = l.actor_admin_id ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?")
      .bind(limit).all<Record<string, unknown>>();
    return json({ events: rows.results ?? [], total_returned: rows.results?.length ?? 0 });
  } catch { return error("Audit history could not be loaded", 503); }
}

type StaffRole = "manager" | "catalogue" | "orders" | "rental" | "viewer";
async function adminStaffRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const collection = path === "/api/admin/staff";
  const match = path.match(/^\/api\/admin\/staff\/([a-f0-9-]{36})$/i);
  if (!collection && !match) return null;
  let admin: SessionRow | null;
  try { admin = await currentAdmin(request, env.DB); } catch { return error("Staff service is temporarily unavailable", 503); }
  if (!admin) return error("Authentication required", 401);
  if (admin.role !== "owner") return error("Only the owner can manage staff access", 403);
  if (request.method === "GET" && collection) {
    try {
      const users = await env.DB.prepare("SELECT id, email, role, is_active, created_at, last_login_at FROM admin_users ORDER BY created_at ASC").all<{id:string;email:string;role:string;is_active:number;created_at:string;last_login_at:string|null}>();
      const invites = await env.DB.prepare("SELECT id, email, role, expires_at, created_at FROM admin_invites WHERE accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 50").bind(new Date().toISOString()).all<{id:string;email:string;role:string;expires_at:string;created_at:string}>();
      return json({ users: users.results ?? [], invites: invites.results ?? [] });
    } catch { return error("Staff list could not be loaded", 503); }
  }
  if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
  if (collection && request.method === "POST") {
    const body = await readJson(request);
    const email = cleanText(body?.email, 160).toLowerCase();
    const role = cleanText(body?.role, 24) as StaffRole;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["manager", "catalogue", "orders", "rental", "viewer"].includes(role)) return error("Enter a valid staff email and role", 400);
    try {
      const existing = await env.DB.prepare("SELECT id FROM admin_users WHERE email = ? COLLATE NOCASE LIMIT 1").bind(email).first<{id:string}>();
      if (existing) return error("This email already has a staff account", 409);
      const pending = await env.DB.prepare("SELECT id FROM admin_invites WHERE email = ? COLLATE NOCASE AND accepted_at IS NULL AND expires_at > ? LIMIT 1").bind(email, new Date().toISOString()).first<{id:string}>();
      if (pending) return error("A valid invitation already exists for this email", 409);
      const id = crypto.randomUUID();
      const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO admin_invites (id,email,role,token_hash,invited_by,expires_at) VALUES (?,?,?,?,?,?)").bind(id,email,role,await sha256(token),admin.admin_user_id,expires),
        env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'staff.invited','admin_invite',?,?)").bind(crypto.randomUUID(),admin.admin_user_id,id,JSON.stringify({email,role,expires_at:expires})),
      ]);
      return json({ created:true, invite:{id,email,role,expires_at:expires,invite_url:"/admin/invite/"+token } },201);
    } catch { return error("Staff invitation could not be created",503); }
  }
  if (match && request.method === "PATCH") {
    const targetId = match[1];
    if (targetId === admin.admin_user_id) return error("You cannot change your own role or access here", 409);
    const body = await readJson(request);
    if (!body || (body.role !== undefined && !["manager","catalogue","orders","rental","viewer"].includes(String(body.role))) || (body.is_active !== undefined && ![0,1,true,false].includes(body.is_active as boolean))) return error("Choose a valid role or account status",400);
    try {
      const target = await env.DB.prepare("SELECT id,email,role,is_active FROM admin_users WHERE id = ? LIMIT 1").bind(targetId).first<{id:string;email:string;role:string;is_active:number}>();
      if (!target) return error("Staff account not found",404);
      if (target.role === "owner") return error("Owner access cannot be changed from staff management",403);
      const role = body.role === undefined ? target.role : String(body.role);
      const active = body.is_active === undefined ? target.is_active : (body.is_active === true || body.is_active === 1 ? 1 : 0);
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("UPDATE admin_users SET role = ?, is_active = ? WHERE id = ? AND role <> 'owner'").bind(role,active,targetId),
        env.DB.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE admin_user_id = ? AND revoked_at IS NULL AND ? = 0").bind(now,targetId,active),
        env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'staff.access_updated','admin_user',?,?)").bind(crypto.randomUUID(),admin.admin_user_id,targetId,JSON.stringify({email:target.email,from_role:target.role,to_role:role,from_active:target.is_active,to_active:active})),
      ]);
      return json({updated:true,id:targetId,role,is_active:active});
    } catch { return error("Staff access could not be updated",503); }
  }
  return error("Method not allowed",405);
}


const socialPlatforms = ["facebook","instagram","tiktok","youtube","linkedin","pinterest","threads","x"] as const;
type SocialLinks = Partial<Record<typeof socialPlatforms[number],string>>;
async function adminStoreSettingsRoutes(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(url.pathname!=="/api/admin/settings") return null;
  let admin:SessionRow|null;
  try{admin=await currentAdmin(request,env.DB);}catch{return error("Website settings are temporarily unavailable",503);}
  if(!admin)return error("Authentication required",401);
  if(admin.role!=="owner")return error("Only the owner can change website settings",403);
  if(request.method==="GET"){
    try{const rows=await env.DB.prepare("SELECT setting_key,setting_value_json FROM store_settings WHERE is_public=1 OR setting_key='cnic_uploads_enabled'").all<{setting_key:string;setting_value_json:string}>();const settings:Record<string,unknown>={cnic_uploads_enabled:false};for(const row of rows.results??[]){try{settings[row.setting_key]=JSON.parse(row.setting_value_json);}catch{}}return json({settings});}catch{return error("Website settings could not be loaded",503);}
  }
  if(request.method!=="PATCH")return error("Method not allowed",405);
  if(!requireSameOrigin(request,url))return error("Request origin could not be verified",403);
  const body=await readJson(request);
  const hasLinks=body?.social_links!==undefined;
  const hasBrand=body?.brand_assets!==undefined;
  const hasCnicUploads=body?.cnic_uploads_enabled!==undefined;
  if(!hasLinks&&!hasBrand&&!hasCnicUploads)return error("Submit website settings to save",400);
  if(hasCnicUploads&&typeof body?.cnic_uploads_enabled!=="boolean")return error("Choose a valid CNIC upload setting",400);
  const statements: D1PreparedStatement[]=[];
  const now=new Date().toISOString();
  let links:SocialLinks|undefined;
  let brandAssets:{logo_id:string|null;favicon_id:string|null}|undefined;
  if(hasLinks){
    const raw=body?.social_links;
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return error("Submit valid social account links",400);
    links={};
    for(const platform of socialPlatforms){const value=cleanText((raw as Record<string,unknown>)[platform],500);if(!value)continue;try{const parsed=new URL(value);if(parsed.protocol!=="https:"||!parsed.hostname.includes("."))return error("Social links must be valid HTTPS URLs",400);links[platform]=parsed.toString();}catch{return error("One of the social links is invalid",400);}}
    statements.push(env.DB.prepare("INSERT INTO store_settings (setting_key,setting_value_json,is_public,updated_by,updated_at) VALUES ('social_links',?,1,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value_json=excluded.setting_value_json,is_public=1,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(links),admin.admin_user_id,now));
    statements.push(env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'website.social_links_updated','store_settings','social_links',?)").bind(crypto.randomUUID(),admin.admin_user_id,JSON.stringify({platforms:Object.keys(links)})));
  }
  if(hasCnicUploads){
    const enabled=body?.cnic_uploads_enabled===true;
    statements.push(env.DB.prepare("INSERT INTO store_settings (setting_key,setting_value_json,is_public,updated_by,updated_at) VALUES ('cnic_uploads_enabled',?,0,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value_json=excluded.setting_value_json,is_public=0,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(enabled),admin.admin_user_id,now));
    statements.push(env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'website.cnic_upload_setting_changed','store_settings','cnic_uploads_enabled',?)").bind(crypto.randomUUID(),admin.admin_user_id,JSON.stringify({enabled})));
  }
  if(hasBrand){
    const raw=body?.brand_assets;
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return error("Submit valid brand asset settings",400);
    const source=raw as Record<string,unknown>;
    const logoId=source.logo_id===undefined||source.logo_id===null||source.logo_id===""?null:cleanText(source.logo_id,64);
    const faviconId=source.favicon_id===undefined||source.favicon_id===null||source.favicon_id===""?null:cleanText(source.favicon_id,64);
    for(const id of [logoId,faviconId]){
      if(id&&!/^[a-f0-9-]{36}$/i.test(id))return error("Choose a valid logo or favicon image",400);
      if(id){const media=await env.DB.prepare("SELECT id FROM media_assets WHERE id=? AND media_type='image' AND status='ready' LIMIT 1").bind(id).first<{id:string}>();if(!media)return error("A selected brand image is unavailable",404);}
    }
    brandAssets={logo_id:logoId,favicon_id:faviconId};
    statements.push(env.DB.prepare("INSERT INTO store_settings (setting_key,setting_value_json,is_public,updated_by,updated_at) VALUES ('brand_assets',?,1,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value_json=excluded.setting_value_json,is_public=1,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(brandAssets),admin.admin_user_id,now));
    statements.push(env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'website.brand_assets_updated','store_settings','brand_assets',?)").bind(crypto.randomUUID(),admin.admin_user_id,JSON.stringify({logo_set:Boolean(logoId),favicon_set:Boolean(faviconId)})));
  }
  try{
    await env.DB.batch(statements);
    return json({updated:true,...(links?{social_links:links}:{}),...(brandAssets?{brand_assets:brandAssets}:{}),...(hasCnicUploads?{cnic_uploads_enabled:body?.cnic_uploads_enabled===true}:{})});
  }catch{return error("Website settings could not be saved",503);}
}
async function publicStoreSettingsRoute(request:Request,env:Env):Promise<Response|null>{
  if(request.url && new URL(request.url).pathname==="/api/storefront/settings" && request.method==="GET"){
    try{
      const rows=await env.DB.prepare("SELECT setting_key,setting_value_json FROM store_settings WHERE is_public=1 AND setting_key IN ('social_links','brand_assets')").all<{setting_key:string;setting_value_json:string}>();
      const settings:Record<string,unknown>={social_links:{},brand_assets:{logo_id:null,favicon_id:null}};
      for(const row of rows.results??[]){try{settings[row.setting_key]=JSON.parse(row.setting_value_json);}catch{}}
      return json(settings);
    }catch{return error("Store settings are temporarily unavailable",503);}
  }
  return null;
}



async function recordOwnerNotification(db:D1Database,event:{event_type:"order.created"|"rental.created"|"enquiry.created"|"payment.succeeded";title:string;body:string;entity_type:"order"|"rental_request"|"enquiry";entity_id:string}):Promise<void>{
  await db.prepare("INSERT INTO owner_notifications (id,event_type,title,body,entity_type,entity_id) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),event.event_type,event.title.slice(0,160),event.body.slice(0,500),event.entity_type,event.entity_id).run();
}
async function ownerNotificationRoutes(request:Request,env:Env,url:URL):Promise<Response|null>{
  const path=url.pathname;
  const collection=path==="/api/admin/notifications";
  const readAll=path==="/api/admin/notifications/read-all";
  const readMatch=path.match(new RegExp("^/api/admin/notifications/([a-f0-9-]{36})/read$","i"));
  if(!collection&&!readAll&&!readMatch)return null;
  let admin:SessionRow|null;
  try{admin=await currentAdmin(request,env.DB);}catch{return error("Notification inbox is temporarily unavailable",503);}
  if(!admin)return error("Authentication required",401);
  if(admin.role!=="owner")return error("Only the owner can view business-wide notifications",403);
  if(collection&&request.method==="GET"){
    try{
      const rows=await env.DB.prepare("SELECT id,event_type,title,body,entity_type,entity_id,is_read,created_at,read_at FROM owner_notifications ORDER BY created_at DESC LIMIT 100").all<Record<string,unknown>>();
      const unread=await env.DB.prepare("SELECT COUNT(*) AS total FROM owner_notifications WHERE is_read=0").first<{total:number}>();
      return json({notifications:rows.results??[],unread:unread?.total??0});
    }catch{return error("Notification inbox could not be loaded",503);}
  }
  if(!requireSameOrigin(request,url))return error("Request origin could not be verified",403);
  if(readAll&&request.method==="POST"){
    try{await env.DB.prepare("UPDATE owner_notifications SET is_read=1,read_at=? WHERE is_read=0").bind(new Date().toISOString()).run();return json({updated:true});}
    catch{return error("Notifications could not be marked as read",503);}
  }
  if(readMatch&&request.method==="PATCH"){
    try{const result=await env.DB.prepare("UPDATE owner_notifications SET is_read=1,read_at=? WHERE id=? AND is_read=0").bind(new Date().toISOString(),readMatch[1]).run();return json({updated:true,changed:(result.meta?.changes??0)===1});}
    catch{return error("Notification could not be updated",503);}
  }
  return error("Method not allowed",405);
}

const cmsSectionTypes = new Set(["hero","rich_text","image_text","image_gallery","video","product_collection","category_grid","promo_banner","contact_cta","faq"]);
const cmsSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function normalizeCmsSection(value: unknown, position: number): {id:string;section_type:string;position:number;content_json:string;is_visible:number}|null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row=value as Record<string,unknown>;
  const sectionType=cleanText(row.section_type,40);
  if (!cmsSectionTypes.has(sectionType)) return null;
  const raw=row.content && typeof row.content==="object" && !Array.isArray(row.content) ? row.content as Record<string,unknown> : {};
  const content:Record<string,string>={};
  for (const key of ["eyebrow","heading","body","image_url","button_text","button_href"]) {
    const value=cleanText(raw[key],key==="body"?3000: key==="image_url"||key==="button_href"?240:500);
    if (!value) continue;
    if (key==="image_url" && !/^\/media\/[a-f0-9-]{36}$/i.test(value)) return null;
    if (key==="button_href" && (!value.startsWith("/") || value.startsWith("//") || value.length>240)) return null;
    content[key]=value;
  }
  const id=cleanText(row.id,64);
  return {id:/^[a-f0-9-]{36}$/i.test(id)?id:crypto.randomUUID(),section_type:sectionType,position,is_visible:row.is_visible===false?0:1,content_json:JSON.stringify(content)};
}
async function cmsContentRoutes(request:Request,env:Env,url:URL):Promise<Response|null>{
  const path=url.pathname;
  const publicMatch=path.match(/^\/api\/pages\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if(publicMatch&&request.method==="GET"){
    try{
      const page=await env.DB.prepare("SELECT id,slug,title,page_type,seo_title,seo_description FROM site_pages WHERE slug=? AND status='published' LIMIT 1").bind(publicMatch[1]).first<Record<string,unknown>>();
      if(!page)return error("Page not found",404);
      const rows=await env.DB.prepare("SELECT id,section_type,position,content_json,is_visible FROM site_page_sections WHERE page_id=? AND is_visible=1 ORDER BY position").bind(page.id).all<Record<string,unknown>>();
      const sections=(rows.results??[]).map(row=>{let content:Record<string,string>={};try{const parsed=JSON.parse(String(row.content_json));if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))content=parsed;}catch{}return{id:row.id,section_type:row.section_type,position:row.position,content};});
      return json({page,sections});
    }catch{return error("Page content is temporarily unavailable",503);}
  }
  const adminCollection=path==="/api/admin/pages";
  const adminPageMatch=path.match(/^\/api\/admin\/pages\/([a-f0-9-]{36})$/i);
  const navigation=path==="/api/admin/navigation";
  if(!adminCollection&&!adminPageMatch&&!navigation)return null;
  let admin:SessionRow|null;
  try{admin=await currentAdmin(request,env.DB);}catch{return error("Content workspace is temporarily unavailable",503);}
  if(!admin)return error("Authentication required",401);
  if(!["owner","manager"].includes(admin.role))return error("Only an owner or manager can manage website content",403);
  if(request.method==="GET"){
    try{
      if(adminCollection){
        const rows=await env.DB.prepare("SELECT id,slug,title,page_type,status,seo_title,seo_description,updated_at FROM site_pages ORDER BY updated_at DESC LIMIT 100").all<Record<string,unknown>>();
        return json({pages:rows.results??[]});
      }
      if(adminPageMatch){
        const page=await env.DB.prepare("SELECT id,slug,title,page_type,status,seo_title,seo_description,updated_at FROM site_pages WHERE id=? LIMIT 1").bind(adminPageMatch[1]).first<Record<string,unknown>>();
        if(!page)return error("Page not found",404);
        const rows=await env.DB.prepare("SELECT id,section_type,position,content_json,is_visible FROM site_page_sections WHERE page_id=? ORDER BY position").bind(adminPageMatch[1]).all<Record<string,unknown>>();
        const sections=(rows.results??[]).map(row=>{let content:Record<string,string>={};try{const parsed=JSON.parse(String(row.content_json));if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))content=parsed;}catch{}return{id:row.id,section_type:row.section_type,position:row.position,is_visible:row.is_visible===1,content};});
        return json({page,sections});
      }
      const rows=await env.DB.prepare("SELECT id,label,href,position,is_visible FROM site_navigation_items ORDER BY position LIMIT 50").all<Record<string,unknown>>();
      return json({items:rows.results??[]});
    }catch{return error("Website content could not be loaded",503);}
  }
  if(!requireSameOrigin(request,url))return error("Request origin could not be verified",403);
  if(navigation&&request.method==="PUT"){
    const body=await readJson(request,12000),items=body?.items;
    if(!Array.isArray(items)||items.length>30)return error("Submit up to 30 valid navigation links",400);
    const normalized:Array<{id:string;label:string;href:string;position:number;is_visible:number}>=[];
    for(let i=0;i<items.length;i++){
      const item=items[i] as Record<string,unknown>;
      const label=cleanText(item?.label,60),href=cleanText(item?.href,240);
      if(label.length<1||!href.startsWith("/")||href.startsWith("//"))return error("Navigation labels and safe internal links are required",400);
      normalized.push({id:crypto.randomUUID(),label,href,position:i,is_visible:item?.is_visible===false?0:1});
    }
    try{
      const statements:D1PreparedStatement[]=[env.DB.prepare("DELETE FROM site_navigation_items")];
      for(const item of normalized)statements.push(env.DB.prepare("INSERT INTO site_navigation_items (id,label,href,position,is_visible) VALUES (?,?,?,?,?)").bind(item.id,item.label,item.href,item.position,item.is_visible));
      statements.push(env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'website.navigation_updated','store_settings','navigation',?)").bind(crypto.randomUUID(),admin.admin_user_id,JSON.stringify({count:normalized.length})));
      await env.DB.batch(statements);return json({updated:true,items:normalized});
    }catch{return error("Navigation could not be saved",503);}
  }
  if(adminCollection&&request.method==="POST"){
    const body=await readJson(request,4000);if(!body)return error("Submit valid page details",400);
    const title=cleanText(body.title,120),slug=cleanText(body.slug,80).toLowerCase(),pageType=cleanText(body.page_type,20)||"standard";
    if(title.length<2||!cmsSlugPattern.test(slug)||!["standard","landing","policy","home"].includes(pageType))return error("Check the page title, URL slug and page type",400);
    try{
      const existing=await env.DB.prepare("SELECT id FROM site_pages WHERE slug=? LIMIT 1").bind(slug).first<{id:string}>();
      if(existing)return error("A page already uses this URL slug",409);
      const id=crypto.randomUUID(),now=new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO site_pages (id,slug,title,page_type,status,seo_title,seo_description,created_by,updated_by,updated_at) VALUES (?,?,?,?,'draft','','',?,?,?)").bind(id,slug,title,pageType,admin.admin_user_id,admin.admin_user_id,now),
        env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'website.page_created','page',?,?)").bind(crypto.randomUUID(),admin.admin_user_id,id,JSON.stringify({slug,page_type:pageType}))
      ]);
      return json({created:true,id},201);
    }catch{return error("Page could not be created",503);}
  }
  if(adminPageMatch&&request.method==="PATCH"){
    const body=await readJson(request,30000);if(!body)return error("Submit valid page content",400);
    const id=adminPageMatch[1],title=cleanText(body.title,120),slug=cleanText(body.slug,80).toLowerCase(),pageType=cleanText(body.page_type,20),status=cleanText(body.status,20);
    const seoTitle=cleanText(body.seo_title,70),seoDescription=cleanText(body.seo_description,160);
    if(title.length<2||!cmsSlugPattern.test(slug)||!["standard","landing","policy","home"].includes(pageType)||!["draft","published","archived"].includes(status))return error("Check the page title, URL slug, page type and publication status",400);
    if(status==="published"&&cleanText(body.seo_title,70).length===0)return error("Add an SEO title before publishing",400);
    if(!Array.isArray(body.sections)||body.sections.length>20)return error("A page can contain up to 20 sections",400);
    const sections:Array<{id:string;section_type:string;position:number;content_json:string;is_visible:number}>=[];
    for(let i=0;i<body.sections.length;i++){const section=normalizeCmsSection(body.sections[i],i);if(!section)return error("One section contains an unsupported block type or unsafe content. Check image URLs and button destinations.",400);sections.push(section);}
    if(status==="published"&&sections.length===0)return error("Add at least one section before publishing",400);
    try{
      const current=await env.DB.prepare("SELECT id,slug,title,page_type,status,seo_title,seo_description FROM site_pages WHERE id=? LIMIT 1").bind(id).first<Record<string,unknown>>();
      if(!current)return error("Page not found",404);
      const duplicate=await env.DB.prepare("SELECT id FROM site_pages WHERE slug=? AND id<>? LIMIT 1").bind(slug,id).first<{id:string}>();
      if(duplicate)return error("A page already uses this URL slug",409);
      const oldSections=await env.DB.prepare("SELECT id,section_type,position,content_json,is_visible FROM site_page_sections WHERE page_id=? ORDER BY position").bind(id).all<Record<string,unknown>>();
      const snapshot=JSON.stringify({page:current,sections:oldSections.results??[]});
      const revision=await env.DB.prepare("SELECT COALESCE(MAX(revision_number),0)+1 AS next FROM content_revisions WHERE entity_type='page' AND entity_id=?").bind(id).first<{next:number}>();
      const now=new Date().toISOString();
      const statements:D1PreparedStatement[]=[
        env.DB.prepare("INSERT INTO content_revisions (id,entity_type,entity_id,revision_number,snapshot_json,created_by) VALUES (?,'page',?,?,?,?)").bind(crypto.randomUUID(),id,revision?.next??1,snapshot,admin.admin_user_id),
        env.DB.prepare("UPDATE site_pages SET slug=?,title=?,page_type=?,status=?,seo_title=?,seo_description=?,updated_by=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,updated_at=? WHERE id=?").bind(slug,title,pageType,status,seoTitle,seoDescription,admin.admin_user_id,status,now,now,id),
        env.DB.prepare("DELETE FROM site_page_sections WHERE page_id=?").bind(id)
      ];
      for(const section of sections)statements.push(env.DB.prepare("INSERT INTO site_page_sections (id,page_id,section_type,position,content_json,is_visible,updated_at) VALUES (?,?,?,?,?,?,?)").bind(section.id,id,section.section_type,section.position,section.content_json,section.is_visible,now));
      statements.push(env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.admin_user_id,status==="published"?"website.page_published":"website.page_updated","page",id,JSON.stringify({slug,status,sections:sections.length})));
      await env.DB.batch(statements);
      return json({updated:true,status,revision:revision?.next??1});
    }catch{return error("Page could not be saved. Your previous published version has been preserved.",503);}
  }
  if(adminPageMatch&&request.method==="DELETE"){
    try{const result=await env.DB.prepare("UPDATE site_pages SET status='archived',updated_by=?,updated_at=? WHERE id=?").bind(admin.admin_user_id,new Date().toISOString(),adminPageMatch[1]).run();if((result.meta?.changes??0)!==1)return error("Page not found",404);await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) VALUES (?,?, 'website.page_archived','page',?,'{}')").bind(crypto.randomUUID(),admin.admin_user_id,adminPageMatch[1]).run();return json({archived:true});}catch{return error("Page could not be archived",503);}
  }
  return error("Method not allowed",405);
}

async function adminAuth(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/admin/")) return null;


  if (path === "/api/admin/invites/accept" && request.method === "POST") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified",403);
    const body = await readJson(request);
    const token = cleanText(body?.token,100);
    const password = typeof body?.password === "string" ? body.password : "";
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token) || password.length < 12 || password.length > 128) return error("Use a valid invitation and a password of at least 12 characters",400);
    try {
      const tokenHash = await sha256(token);
      const invite = await env.DB.prepare("SELECT id,email,role,expires_at,accepted_at FROM admin_invites WHERE token_hash = ? LIMIT 1").bind(tokenHash).first<{id:string;email:string;role:string;expires_at:string;accepted_at:string|null}>();
      if (!invite || invite.accepted_at || invite.expires_at <= new Date().toISOString()) return error("This invitation is invalid or has expired",410);
      const existing = await env.DB.prepare("SELECT id FROM admin_users WHERE email = ? COLLATE NOCASE LIMIT 1").bind(invite.email).first<{id:string}>();
      if (existing) return error("An account already exists for this invitation email",409);
      const userId = crypto.randomUUID();
      const sessionToken = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const hash = await passwordHash(password);
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO admin_users (id,email,password_hash,role) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM admin_invites WHERE id = ? AND token_hash = ? AND accepted_at IS NULL AND expires_at > ?) AND NOT EXISTS (SELECT 1 FROM admin_users WHERE email = ? COLLATE NOCASE)").bind(userId,invite.email,hash,invite.role,invite.id,tokenHash,new Date().toISOString(),invite.email),
        env.DB.prepare("INSERT INTO admin_sessions (id,admin_user_id,token_hash,expires_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM admin_users WHERE id = ?)").bind(crypto.randomUUID(),userId,await sha256(sessionToken),expiresAt,userId),
        env.DB.prepare("UPDATE admin_invites SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL AND EXISTS (SELECT 1 FROM admin_users WHERE id = ?)").bind(new Date().toISOString(),invite.id,userId),
        env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) SELECT ?,?,'staff.invite_accepted','admin_user',?,? WHERE EXISTS (SELECT 1 FROM admin_users WHERE id = ?)").bind(crypto.randomUUID(),null,userId,JSON.stringify({email:invite.email,role:invite.role}),userId),
      ]);
      if ((results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1 || (results[2]?.meta?.changes ?? 0) !== 1) return error("Invitation could not be accepted. It may already have been used.",409);
      return json({authenticated:true,admin:{id:userId,email:invite.email,role:invite.role}},201,{"set-cookie":sessionCookie(sessionToken,12*60*60)});
    } catch { return error("Invitation acceptance could not be completed",503); }
  }

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

  const staffResponse = await adminStaffRoutes(request, env, url);
  if (staffResponse) return staffResponse;

  const settingsResponse = await adminStoreSettingsRoutes(request, env, url);
  if(settingsResponse)return settingsResponse;

  const returnAdminResponse = await adminReturnRoutes(request, env, url);
  if (returnAdminResponse) return returnAdminResponse;

  const orderResponse = await adminOrderRoutes(request, env, url);
  if (orderResponse) return orderResponse;

  const productMediaResponse = await adminProductMediaRoutes(request, env, url);
  if (productMediaResponse) return productMediaResponse;

  const mediaResponse = await adminMediaRoutes(request, env, url);
  if (mediaResponse) return mediaResponse;

  const productImageResponse = await adminProductImageRoutes(request, env, url);
  if (productImageResponse) return productImageResponse;

  const inventoryResponse = await adminInventoryRoutes(request, env, url);
  if (inventoryResponse) return inventoryResponse;

  const vehicleAdminResponse = await adminVehicleRoutes(request, env, url);
  if (vehicleAdminResponse) return vehicleAdminResponse;

  const rentalDocumentAdminResponse = await adminRentalDocumentRoutes(request, env, url);
  if (rentalDocumentAdminResponse) return rentalDocumentAdminResponse;

  const rentalAdminResponse = await adminRentalRoutes(request, env, url);
  if (rentalAdminResponse) return rentalAdminResponse;

  const wholesaleAdminResponse = await adminWholesaleQuoteRoutes(request, env, url);
  if (wholesaleAdminResponse) return wholesaleAdminResponse;

  const customerAdminResponse = await adminCustomerRoutes(request, env, url);
  if (customerAdminResponse) return customerAdminResponse;

  const auditLogResponse = await adminAuditLogRoutes(request, env, url);
  if (auditLogResponse) return auditLogResponse;

  const notificationResponse = await ownerNotificationRoutes(request, env, url);
  if (notificationResponse) return notificationResponse;

  const cmsResponse = await cmsContentRoutes(request, env, url);
  if (cmsResponse) return cmsResponse;

  const enquiryResponse = await adminEnquiryRoutes(request, env, url);
  if (enquiryResponse) return enquiryResponse;

  const productResponse = await adminProductRoutes(request, env, url);
  if (productResponse) return productResponse;
  return error("Not found", 404);
}



interface CustomerSessionRow {
  id: string;
  customer_id: string;
  email: string;
  full_name: string;
  phone: string;
  status: string;
  expires_at: string;
  revoked_at: string | null;
}

function customerSessionCookie(token: string, maxAge: number): string {
  return `__Host-deverve_customer=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function createCustomerSession(db: D1Database, customerId: string): Promise<{ token: string; expiresAt: string }> {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO customer_sessions (id, customer_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), customerId, await sha256(token), expiresAt).run();
  return { token, expiresAt };
}

async function currentCustomer(request: Request, db: D1Database): Promise<CustomerSessionRow | null> {
  const token = cookieValue(request, "__Host-deverve_customer");
  if (!token || token.length > 100) return null;
  return db.prepare(
    "SELECT s.id, s.customer_id, c.email, c.full_name, c.phone, c.status, s.expires_at, s.revoked_at FROM customer_sessions s JOIN customers c ON c.id = s.customer_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND c.status = 'active' LIMIT 1",
  ).bind(await sha256(token), new Date().toISOString()).first<CustomerSessionRow>();
}


interface SafepayConfig {
  apiHost: "https://sandbox.api.getsafepay.com";
  merchantApiKey: string;
  secretKey: string;
  webhookSecret: string;
}

function getSafepayConfig(env: Env): SafepayConfig | null {
  if (env.SAFEPAY_ENV !== "sandbox" || !env.SAFEPAY_MERCHANT_API_KEY || !env.SAFEPAY_SECRET_KEY || !env.SAFEPAY_WEBHOOK_SECRET) return null;
  return {
    apiHost: "https://sandbox.api.getsafepay.com",
    merchantApiKey: env.SAFEPAY_MERCHANT_API_KEY,
    secretKey: env.SAFEPAY_SECRET_KEY,
    webhookSecret: env.SAFEPAY_WEBHOOK_SECRET,
  };
}

function constantTimeHexEqual(expected: string, received: string): boolean {
  if (!/^[a-f0-9]{128}$/i.test(expected) || !/^[a-f0-9]{128}$/i.test(received)) return false;
  let difference = 0;
  for (let index = 0; index < 128; index += 1) difference |= expected.toLowerCase().charCodeAt(index) ^ received.toLowerCase().charCodeAt(index);
  return difference === 0;
}

export async function verifySafepaySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return constantTimeHexEqual(expected, signature);
  } catch { return false; }
}

async function safepayApi(config: SafepayConfig, path: string, method: "GET" | "POST", payload?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(config.apiHost + path, {
    method,
    headers: { accept: "application/json", "content-type": "application/json", "X-SFPY-MERCHANT-SECRET": config.secretKey },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const raw = await response.text();
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error("Safepay returned an invalid response"); }
  if (!response.ok) throw new Error("Safepay API request failed");
  return parsed;
}

async function safepayWebhookRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/webhooks/safepay") return null;
  if (request.method !== "POST") return error("Method not allowed", 405);
  const config = getSafepayConfig(env);
  if (!config) return error("Safepay sandbox webhook is not configured", 503);
  const rawBody = await request.text();
  if (!rawBody || rawBody.length > 65_536) return error("Invalid webhook payload", 400);
  const signature = request.headers.get("X-SFPY-SIGNATURE") ?? "";
  if (!await verifySafepaySignature(rawBody, signature, config.webhookSecret)) return error("Invalid Safepay signature", 401);

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody) as Record<string, unknown>; } catch { return error("Invalid webhook JSON", 400); }
  const eventId = cleanText(event.token, 160);
  const eventType = cleanText(event.type, 80);
  const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
  if (!/^evt_[A-Za-z0-9_-]{12,150}$/.test(eventId) || !eventType) return error("Webhook event identity is missing", 400);

  try {
    const prior = await env.DB.prepare("SELECT processing_status FROM payment_webhook_events WHERE provider = 'safepay' AND provider_event_id = ? LIMIT 1")
      .bind(eventId).first<{ processing_status: string }>();
    if (prior?.processing_status === "processed" || prior?.processing_status === "ignored") return json({ received: true, duplicate: true });
    const payloadDigest = await sha256(rawBody);
    await env.DB.prepare("INSERT INTO payment_webhook_events (id, provider, provider_event_id, payload_sha256, processing_status) VALUES (?, 'safepay', ?, ?, 'received') ON CONFLICT(provider, provider_event_id) DO UPDATE SET payload_sha256 = excluded.payload_sha256, processing_status = 'received' WHERE payment_webhook_events.processing_status NOT IN ('processed','ignored')")
      .bind(crypto.randomUUID(), eventId, payloadDigest).run();

    if (eventType !== "payment.succeeded" && eventType !== "payment.failed") {
      await env.DB.prepare("UPDATE payment_webhook_events SET processing_status = 'ignored', processed_at = ? WHERE provider = 'safepay' AND provider_event_id = ?")
        .bind(new Date().toISOString(), eventId).run();
      return json({ received: true, ignored: true });
    }

    const tracker = cleanText(data.tracker, 200);
    if (!/^track_[A-Za-z0-9_-]{12,190}$/.test(tracker)) throw new Error("Safepay event tracker is missing");
    const attempt = await env.DB.prepare("SELECT id, order_id, amount_paisa, status FROM payment_attempts WHERE provider = 'safepay' AND provider_reference = ? LIMIT 1")
      .bind(tracker).first<{ id: string; order_id: string; amount_paisa: number; status: string }>();
    if (!attempt) throw new Error("Payment attempt for webhook tracker was not found");

    if (eventType === "payment.succeeded") {
      const amount = data.amount;
      const currency = cleanText(data.currency, 3);
      const state = cleanText(data.state, 40);
      if (state !== "TRACKER_ENDED" || currency !== "PKR" || !Number.isSafeInteger(amount) || Number(amount) !== attempt.amount_paisa) {
        throw new Error("Safepay payment amount, currency or final state did not match the stored order");
      }
      const now = new Date().toISOString();
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE payment_attempts SET status = 'succeeded', updated_at = ? WHERE id = ? AND status IN ('created','pending')").bind(now, attempt.id),
        env.DB.prepare("UPDATE orders SET payment_status = 'paid', updated_at = ? WHERE id = ? AND payment_provider = 'safepay' AND payment_status != 'paid' AND total_paisa = ? AND delivery_fee_status = 'accepted' AND order_status IN ('pending','confirmed')").bind(now, attempt.order_id, attempt.amount_paisa),
      ]);
      if ((results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) throw new Error("Payment reconciliation did not update the matching order");
    } else {
      await env.DB.prepare("UPDATE payment_attempts SET status = 'pending', failure_code = 'provider_declined', updated_at = ? WHERE id = ? AND status IN ('created','pending')")
        .bind(new Date().toISOString(), attempt.id).run();
    }

    await env.DB.prepare("UPDATE payment_webhook_events SET processing_status = 'processed', processed_at = ? WHERE provider = 'safepay' AND provider_event_id = ?")
      .bind(new Date().toISOString(), eventId).run();
    return json({ received: true, processed: true });
  } catch (caught) {
    try { await env.DB.prepare("UPDATE payment_webhook_events SET processing_status = 'failed' WHERE provider = 'safepay' AND provider_event_id = ?").bind(eventId).run(); } catch { /* preserve retry response */ }
    console.error("[safepay-webhook] reconciliation failed", caught instanceof Error ? caught.message : "unknown error");
    return error("Safepay webhook could not be reconciled; please retry delivery", 503);
  }
}

async function customerAccountRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (path === "/api/storefront/payment-options" && request.method === "GET") return json({ online_payment_available: Boolean(getSafepayConfig(env)), environment: getSafepayConfig(env) ? "sandbox" : null });
  const paymentMatch = path.match(/^\/api\/customer\/orders\/([a-f0-9-]{36})\/payment$/i);
  const customerReturnMatch = path.match(/^\/api\/customer\/orders\/([a-f0-9-]{36})\/returns$/i);
  const accountPaths = ["/api/customer/register", "/api/customer/login", "/api/customer/me", "/api/customer/logout", "/api/customer/profile", "/api/customer/password", "/api/customer/orders", "/api/customer/rentals", "/api/customer/returns"];
  if (!accountPaths.includes(path) && !paymentMatch && !customerReturnMatch) return null;

  if (path === "/api/customer/register" && request.method === "POST") {
    const limited = await enforcePublicRateLimit(request, env, "customer-register", 3);
    if (limited) return limited;
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request, 8_000);
    if (!body) return error("Please submit valid account details", 400);
    if (cleanText(body.website, 120)) return json({ accepted: true });
    if (!(await verifyTurnstile(request, body.turnstile_token))) return error("Please complete the security check and try again.", 403);
    const email = cleanText(body.email, 160).toLowerCase();
    const fullName = cleanText(body.full_name, 100);
    const phone = cleanText(body.phone, 24);
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || fullName.length < 2 || !validPhone(phone) || password.length < 12 || password.length > 128) {
      return error("Enter a valid email, name, phone number and a password of at least 12 characters.", 400);
    }
    try {
      const id = crypto.randomUUID();
      const hash = await passwordHash(password);
      const sessionToken = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const tokenHash = await sha256(sessionToken);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO customers (id, email, password_hash, full_name, phone) VALUES (?, ?, ?, ?, ?)")
          .bind(id, email, hash, fullName, phone),
        env.DB.prepare("INSERT INTO customer_sessions (id, customer_id, token_hash, expires_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM customers WHERE id = ? AND status = 'active')")
          .bind(crypto.randomUUID(), id, tokenHash, expiresAt, id),
      ]);
      if ((results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) return error("This email may already have an account. Try signing in instead.", 409);
      return json({ authenticated: true, customer: { id, email, full_name: fullName, phone, email_verified: false } }, 201, { "set-cookie": customerSessionCookie(sessionToken, 30 * 24 * 60 * 60) });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (/unique|constraint/i.test(message)) return error("An account with this email already exists. Please sign in.", 409);
      return error("Your account could not be created. Please try again.", 503);
    }
  }

  if (path === "/api/customer/login" && request.method === "POST") {
    const limited = await enforcePublicRateLimit(request, env, "customer-login", 5);
    if (limited) return limited;
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request, 4_000);
    if (!body) return error("Please submit valid sign-in details", 400);
    const email = cleanText(body.email, 160).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 128) return error("Email or password is incorrect", 401);
    try {
      const customer = await env.DB.prepare("SELECT id, email, password_hash, full_name, phone, status FROM customers WHERE email = ? COLLATE NOCASE LIMIT 1")
        .bind(email).first<{ id: string; email: string; password_hash: string; full_name: string; phone: string; status: string }>();
      const dummyHash = "pbkdf2-sha256$100000$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      const matches = await verifyPassword(password, customer?.password_hash ?? dummyHash);
      if (!customer || customer.status !== "active" || !matches) return error("Email or password is incorrect", 401);
      const session = await createCustomerSession(env.DB, customer.id);
      await env.DB.prepare("UPDATE customers SET last_login_at = ?, updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), new Date().toISOString(), customer.id).run();
      return json({ authenticated: true, customer: { id: customer.id, email: customer.email, full_name: customer.full_name, phone: customer.phone, email_verified: false } }, 200, { "set-cookie": customerSessionCookie(session.token, 30 * 24 * 60 * 60) });
    } catch { return error("Sign-in is temporarily unavailable. Please try again.", 503); }
  }

  if (path === "/api/customer/logout" && request.method === "POST") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    try {
      const token = cookieValue(request, "__Host-deverve_customer");
      if (token) await env.DB.prepare("UPDATE customer_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
        .bind(new Date().toISOString(), await sha256(token)).run();
      return json({ authenticated: false }, 200, { "set-cookie": customerSessionCookie("", 0) });
    } catch { return error("Sign-out could not be completed", 503); }
  }

  let customer: CustomerSessionRow | null;
  try { customer = await currentCustomer(request, env.DB); }
  catch { return error("Customer account service is temporarily unavailable", 503); }
  if (!customer) return error("Please sign in to access your account.", 401);


  if (paymentMatch && request.method === "POST") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const config = getSafepayConfig(env);
    if (!config) return error("Secure online payment is not enabled yet. Please use cash on delivery or contact De VERVE.", 503);
    const orderId = paymentMatch[1];
    try {
      const order = await env.DB.prepare("SELECT id, order_number, total_paisa, payment_status, payment_provider, order_status, delivery_fee_status FROM orders WHERE id = ? AND customer_id = ? LIMIT 1")
        .bind(orderId, customer.customer_id).first<{ id: string; order_number: string; total_paisa: number; payment_status: string; payment_provider: string; order_status: string; delivery_fee_status: string }>();
      if (!order) return error("Order not found in your account.", 404);
      if (order.payment_status === "paid") return json({ paid: true, message: "This order is already marked as paid." });
      if (order.payment_provider !== "safepay") return error("Online payment was not selected for this order.", 409);
      if (order.delivery_fee_status !== "accepted") return error("Please approve the final delivery fee before paying.", 409);
      if (!["pending", "confirmed"].includes(order.order_status) || !Number.isSafeInteger(order.total_paisa) || order.total_paisa < 1) return error("This order is not ready for online payment.", 409);
      const existing = await env.DB.prepare("SELECT id, checkout_url, status, created_at FROM payment_attempts WHERE order_id = ? AND provider = 'safepay' AND status IN ('created','pending') ORDER BY created_at DESC LIMIT 1")
        .bind(order.id).first<{ id: string; checkout_url: string | null; status: string; created_at: string }>();
      if (existing?.status === "pending" && existing.checkout_url && Date.now() - Date.parse(existing.created_at) < 55 * 60 * 1000) return json({ checkout_url: existing.checkout_url, reused: true });
      if (existing?.status === "created") return error("Your payment session is being prepared. Please wait a moment and try again.", 409);

      const attemptId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO payment_attempts (id, order_id, provider, environment, idempotency_key, amount_paisa, currency, status) VALUES (?, ?, 'safepay', 'sandbox', ?, ?, 'PKR', 'created')")
        .bind(attemptId, order.id, idempotencyKey, order.total_paisa).run();
      try {
        const trackerResponse = await safepayApi(config, "/order/payments/v3/", "POST", {
          merchant_api_key: config.merchantApiKey,
          intent: "CYBERSOURCE",
          mode: "payment",
          entry_mode: "raw",
          currency: "PKR",
          amount: order.total_paisa,
          metadata: { order_id: order.id, order_number: order.order_number },
          include_fees: false,
        });
        const trackerData = trackerResponse.data && typeof trackerResponse.data === "object" ? trackerResponse.data as Record<string, unknown> : {};
        const trackerObject = trackerData.tracker && typeof trackerData.tracker === "object" ? trackerData.tracker as Record<string, unknown> : {};
        const tracker = cleanText(trackerObject.token, 200);
        if (!/^track_[A-Za-z0-9_-]{12,190}$/.test(tracker)) throw new Error("Safepay did not return a valid payment tracker");
        const passportResponse = await safepayApi(config, "/client/passport/v1/token", "POST");
        const passportData = passportResponse.data;
        const tbt = typeof passportData === "string" ? passportData : "";
        if (tbt.length < 20 || tbt.length > 1000) throw new Error("Safepay did not return a valid checkout token");
        const checkout = new URL("/embedded", config.apiHost);
        checkout.search = new URLSearchParams({
          environment: "sandbox", tracker, source: "hosted", tbt,
          redirect_url: url.origin + "/account?payment=return",
          cancel_url: url.origin + "/account?payment=cancelled",
        }).toString();
        const now = new Date().toISOString();
        const saved = await env.DB.prepare("UPDATE payment_attempts SET provider_reference = ?, checkout_url = ?, status = 'pending', updated_at = ? WHERE id = ? AND status = 'created'")
          .bind(tracker, checkout.toString(), now, attemptId).run();
        if ((saved.meta?.changes ?? 0) !== 1) throw new Error("Payment attempt could not be saved");
        return json({ checkout_url: checkout.toString(), environment: "sandbox" });
      } catch (caught) {
        await env.DB.prepare("UPDATE payment_attempts SET status = 'failed', failure_code = 'provider_error', updated_at = ? WHERE id = ? AND status = 'created'")
          .bind(new Date().toISOString(), attemptId).run();
        throw caught;
      }
    } catch (caught) {
      console.error("[safepay-checkout] session creation failed", caught instanceof Error ? caught.message : "unknown error");
      return error("Secure payment could not be started. Please try again or contact De VERVE.", 503);
    }
  }

  if (path === "/api/customer/me" && request.method === "GET") {
    return json({ authenticated: true, customer: { id: customer.customer_id, email: customer.email, full_name: customer.full_name, phone: customer.phone, email_verified: false } });
  }

  if (path === "/api/customer/profile" && request.method === "PATCH") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request, 3_000);
    const fullName = cleanText(body?.full_name, 100);
    const phone = cleanText(body?.phone, 24);
    if (fullName.length < 2 || !validPhone(phone)) return error("Enter a valid name and phone number.", 400);
    try {
      const result = await env.DB.prepare("UPDATE customers SET full_name = ?, phone = ?, updated_at = ? WHERE id = ? AND status = 'active'")
        .bind(fullName, phone, new Date().toISOString(), customer.customer_id).run();
      if ((result.meta?.changes ?? 0) !== 1) return error("Your profile could not be updated.", 409);
      return json({ updated: true, customer: { id: customer.customer_id, email: customer.email, full_name: fullName, phone, email_verified: false } });
    } catch { return error("Your profile could not be updated. Please try again.", 503); }
  }

  if (path === "/api/customer/password" && request.method === "PATCH") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request, 4_000);
    const currentPassword = typeof body?.current_password === "string" ? body.current_password : "";
    const newPassword = typeof body?.new_password === "string" ? body.new_password : "";
    if (newPassword.length < 12 || newPassword.length > 128) return error("Your new password must be at least 12 characters.", 400);
    try {
      const row = await env.DB.prepare("SELECT password_hash FROM customers WHERE id = ? AND status = 'active' LIMIT 1").bind(customer.customer_id).first<{ password_hash: string }>();
      if (!row || !await verifyPassword(currentPassword, row.password_hash)) return error("Your current password is incorrect.", 403);
      const hash = await passwordHash(newPassword);
      const now = new Date().toISOString();
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE customers SET password_hash = ?, updated_at = ? WHERE id = ? AND status = 'active'").bind(hash, now, customer.customer_id),
        env.DB.prepare("UPDATE customer_sessions SET revoked_at = ? WHERE customer_id = ? AND id <> ? AND revoked_at IS NULL").bind(now, customer.customer_id, customer.id),
      ]);
      if ((results[0]?.meta?.changes ?? 0) !== 1) return error("Your password could not be changed.", 409);
      return json({ updated: true, message: "Password changed. Other signed-in sessions have been signed out." });
    } catch { return error("Your password could not be changed. Please try again.", 503); }
  }

  if (path === "/api/customer/returns" && request.method === "GET") {
    try {
      const rows = await env.DB.prepare("SELECT r.id, r.order_id, r.return_number, r.reason, r.details, r.status, r.refund_amount_paisa, r.refund_method, r.refund_reference, r.admin_note, r.created_at, r.updated_at, o.order_number FROM return_requests r JOIN orders o ON o.id = r.order_id WHERE r.customer_id = ? ORDER BY r.created_at DESC LIMIT 50")
        .bind(customer.customer_id).all<Record<string, unknown>>();
      const returns = rows.results ?? [];
      if (!returns.length) return json({ returns: [] });
      const ids = returns.map((item) => String(item.id));
      const placeholders = ids.map(() => "?").join(",");
      const items = await env.DB.prepare("SELECT ri.id, ri.return_request_id, ri.order_item_id, ri.quantity, ri.unit_refund_paisa, oi.product_name_snapshot, oi.sku_snapshot, oi.size_snapshot, oi.color_snapshot FROM return_request_items ri JOIN order_items oi ON oi.id = ri.order_item_id WHERE ri.return_request_id IN (" + placeholders + ") ORDER BY ri.rowid")
        .bind(...ids).all<Record<string, unknown>>();
      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const item of items.results ?? []) { const id = String(item.return_request_id); grouped.set(id, [...(grouped.get(id) ?? []), item]); }
      const events = await env.DB.prepare("SELECT id, return_request_id, from_status, to_status, actor_type, note, created_at FROM return_status_events WHERE return_request_id IN (" + placeholders + ") ORDER BY created_at, rowid")
        .bind(...ids).all<Record<string, unknown>>();
      const eventGroups = new Map<string, Record<string, unknown>[]>();
      for (const event of events.results ?? []) { const id = String(event.return_request_id); eventGroups.set(id, [...(eventGroups.get(id) ?? []), event]); }
      return json({ returns: returns.map((item) => ({ ...item, items: grouped.get(String(item.id)) ?? [], events: eventGroups.get(String(item.id)) ?? [] })) });
    } catch { return error("Your return requests could not be loaded. Please try again.", 503); }
  }

  if (customerReturnMatch && request.method === "POST") {
    if (!requireSameOrigin(request, url)) return error("Request origin could not be verified", 403);
    const body = await readJson(request, 8_000);
    if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return error("Select at least one item to return.", 400);
    const reason = cleanText(body.reason, 30);
    const details = cleanText(body.details, 1000);
    if (!["wrong_item", "damaged", "size_issue", "not_as_described", "other"].includes(reason) || details.length < 10) return error("Choose a return reason and provide at least 10 characters of detail.", 400);
    const quantities = new Map<string, number>();
    for (const raw of body.items) {
      if (!raw || typeof raw !== "object") return error("A selected return item is invalid.", 400);
      const item = raw as Record<string, unknown>;
      const itemId = cleanText(item.order_item_id, 64);
      const quantity = item.quantity;
      if (!/^[a-f0-9-]{36}$/i.test(itemId) || !Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 10 || quantities.has(itemId)) return error("Check the return item selections and quantities.", 400);
      quantities.set(itemId, Number(quantity));
    }
    try {
      const order = await env.DB.prepare("SELECT id, order_number, order_status, updated_at FROM orders WHERE id = ? AND customer_id = ? LIMIT 1")
        .bind(customerReturnMatch[1], customer.customer_id).first<{ id: string; order_number: string; order_status: string; updated_at: string }>();
      if (!order) return error("Order not found in your account.", 404);
      if (order.order_status !== "delivered") return error("A return can only be requested after delivery.", 409);
      const deliveredAt = Date.parse(order.updated_at);
      if (!Number.isFinite(deliveredAt) || Date.now() - deliveredAt > 7 * 24 * 60 * 60 * 1000 || deliveredAt > Date.now() + 5 * 60 * 1000) return error("The 7-calendar-day return request window has expired.", 409);
      const placeholders = [...quantities.keys()].map(() => "?").join(",");
      const selected = await env.DB.prepare("SELECT id, quantity, unit_price_paisa FROM order_items WHERE order_id = ? AND id IN (" + placeholders + ")")
        .bind(order.id, ...quantities.keys()).all<{ id: string; quantity: number; unit_price_paisa: number }>();
      const orderItems = selected.results ?? [];
      if (orderItems.length !== quantities.size) return error("One or more selected items do not belong to this order.", 400);
      let refundAmount = 0;
      for (const item of orderItems) {
        const quantity = quantities.get(item.id) ?? 0;
        if (quantity > item.quantity || !Number.isSafeInteger(item.unit_price_paisa) || item.unit_price_paisa < 0) return error("Return quantity exceeds the purchased quantity.", 400);
        const lineRefund = quantity * item.unit_price_paisa;
        if (!Number.isSafeInteger(lineRefund) || !Number.isSafeInteger(refundAmount + lineRefund)) return error("Return amount is outside the supported range.", 400);
        refundAmount += lineRefund;
      }
      const id = crypto.randomUUID();
      const randomPart = base64Url(crypto.getRandomValues(new Uint8Array(5))).toUpperCase().replace(/[-_]/g, "").slice(0, 7);
      const returnNumber = "DV-RET-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + randomPart;
      const statements = [
        env.DB.prepare("INSERT INTO return_requests (id, order_id, customer_id, return_number, reason, details, refund_amount_paisa) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(id, order.id, customer.customer_id, returnNumber, reason, details, refundAmount),
      ];
      for (const item of orderItems) statements.push(env.DB.prepare("INSERT INTO return_request_items (id, return_request_id, order_item_id, quantity, unit_refund_paisa) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, item.id, quantities.get(item.id), item.unit_price_paisa));
      statements.push(env.DB.prepare("INSERT INTO return_status_events (id, return_request_id, from_status, to_status, actor_type, actor_id, note) VALUES (?, ?, NULL, 'requested', 'customer', ?, 'Return request submitted')")
        .bind(crypto.randomUUID(), id, customer.customer_id));
      await env.DB.batch(statements);
      return json({ accepted: true, return_number: returnNumber, refund_amount_paisa: refundAmount }, 201);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (/unique|constraint/i.test(message)) return error("A return request already exists for this order.", 409);
      return error("Your return request could not be submitted. Please try again.", 503);
    }
  }

  if (path === "/api/customer/orders" && request.method === "GET") {
    try {
      const rows = await env.DB.prepare("SELECT id, order_number, city, subtotal_paisa, delivery_fee_paisa, total_paisa, payment_method, payment_provider, payment_status, order_status, delivery_fee_status, created_at, updated_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50")
        .bind(customer.customer_id).all<Record<string, unknown>>();
      const orders = rows.results ?? [];
      if (!orders.length) return json({ orders: [] });
      const ids = orders.map((order) => String(order.id));
      const placeholders = ids.map(() => "?").join(",");
      const items = await env.DB.prepare("SELECT id, order_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM order_items WHERE order_id IN (" + placeholders + ") ORDER BY rowid")
        .bind(...ids).all<Record<string, unknown>>();
      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const item of items.results ?? []) {
        const id = String(item.order_id);
        grouped.set(id, [...(grouped.get(id) ?? []), item]);
      }
      const events = await env.DB.prepare("SELECT id, order_id, from_status, to_status, actor_type, note, created_at FROM order_status_events WHERE order_id IN (" + placeholders + ") ORDER BY created_at, rowid").bind(...ids).all<Record<string, unknown>>();
      const eventsByOrder = new Map<string, Record<string, unknown>[]>();
      for (const event of events.results ?? []) { const id = String(event.order_id); eventsByOrder.set(id, [...(eventsByOrder.get(id) ?? []), event]); }
      return json({ orders: orders.map((order) => ({ ...order, items: grouped.get(String(order.id)) ?? [], events: eventsByOrder.get(String(order.id)) ?? [] })) });
    } catch { return error("Your orders could not be loaded. Please try again.", 503); }
  }

  if (path === "/api/customer/rentals" && request.method === "GET") {
    try {
      const rows = await env.DB.prepare("SELECT id, reference_code, vehicle_id, customer_name, pickup_city, pickup_address, destination_city, destination_address, pickup_at, return_at, driver_option, status, created_at FROM rental_requests WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50")
        .bind(customer.customer_id).all<Record<string, unknown>>();
      return json({ rentals: rows.results ?? [] });
    } catch { return error("Your rental requests could not be loaded. Please try again.", 503); }
  }

  return error("Method not allowed", 405);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "allow": "GET, POST, OPTIONS" } });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return error("Cross-origin requests are not accepted", 403);

  const safepayWebhookResponse = await safepayWebhookRoutes(request, env, url);
  if (safepayWebhookResponse) return safepayWebhookResponse;

  const customerResponse = await customerAccountRoutes(request, env, url);
  if (customerResponse) return customerResponse;

  const adminResponse = await adminAuth(request, env, url);
  if (adminResponse) return adminResponse;

  const enquiryResponse = await adminEnquiryRoutes(request, env, url);
  if (enquiryResponse) return enquiryResponse;

  const productResponse = await adminProductRoutes(request, env, url);
  if (productResponse) return productResponse;

  const publicSettingsResponse = await publicStoreSettingsRoute(request, env);
  if(publicSettingsResponse)return publicSettingsResponse;

  if (url.pathname === "/api/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ status: "ok", database: "connected" });
    } catch {
      return error("Service temporarily unavailable", 503);
    }
  }

  const productMediaAdmin = await adminProductMediaRoutes(request, env, url);
  if (productMediaAdmin) return productMediaAdmin;

  const publicMedia = url.pathname.match(/^\/media\/([a-f0-9-]{36})$/i);
  if (publicMedia && request.method === "GET") {
    try {
      const asset = await env.DB.prepare("SELECT m.object_key, m.mime_type AS content_type FROM media_assets m WHERE m.id = ? AND m.status = 'ready' AND (EXISTS (SELECT 1 FROM products p WHERE p.image_key = m.id AND p.status = 'published') OR EXISTS (SELECT 1 FROM product_media_assets pm JOIN products p ON p.id = pm.product_id WHERE pm.media_asset_id = m.id AND p.status = 'published') OR EXISTS (SELECT 1 FROM vehicles v WHERE v.image_key = m.id AND v.status = 'available') OR EXISTS (SELECT 1 FROM store_settings s WHERE s.setting_key='brand_assets' AND s.is_public=1 AND (json_extract(s.setting_value_json,'$.logo_id')=m.id OR json_extract(s.setting_value_json,'$.favicon_id')=m.id))) LIMIT 1").bind(publicMedia[1]).first<{ object_key: string; content_type: string }>();
      if (!asset) return error("Media not found", 404);
      const object = await env.MEDIA.get(asset.object_key); if (!object) return error("Media not found", 404);
      return new Response(object.body, { headers: { "content-type": asset.content_type, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
    } catch { return error("Media is temporarily unavailable", 503); }
  }

  if (url.pathname === "/api/products" && request.method === "GET") {
    try {
      const category = cleanText(url.searchParams.get("category"), 60);
      const slug = cleanText(url.searchParams.get("slug"), 120);
      const limitValue = Number(url.searchParams.get("limit") ?? "24");
      const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 60) : 24;
      const columns = "SELECT id, slug, name, description, category, audience, retail_price_paisa, image_key, seo_title, seo_description FROM products WHERE status = 'published'";
      const rows = slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        ? await env.DB.prepare(columns + " AND slug = ? LIMIT 1").bind(slug).all<ProductRow>()
        : category
          ? await env.DB.prepare(columns + " AND category = ? ORDER BY created_at DESC LIMIT ?").bind(category, limit).all<ProductRow>()
          : await env.DB.prepare(columns + " ORDER BY created_at DESC LIMIT ?").bind(limit).all<ProductRow>();
      const products = rows.results ?? [];
      if (!products.length) return json({ products: [] });
      const productIds = products.map((product) => product.id);
      const placeholders = productIds.map(() => "?").join(",");
      const mediaRows = await env.DB.prepare("SELECT pm.product_id, a.id, a.media_type, a.mime_type, a.alt_text, a.caption, pm.position, pm.is_primary FROM product_media_assets pm JOIN media_assets a ON a.id = pm.media_asset_id WHERE a.status = 'ready' AND pm.product_id IN (" + placeholders + ") ORDER BY pm.position, a.created_at").bind(...productIds).all<Record<string, unknown>>();
      const mediaByProduct = new Map<string, Array<Record<string, unknown>>>();
      for (const media of mediaRows.results ?? []) {
        const productId = String(media.product_id);
        mediaByProduct.set(productId, [...(mediaByProduct.get(productId) ?? []), { id: media.id, media_type: media.media_type, mime_type: media.mime_type, alt_text: media.alt_text, caption: media.caption, is_primary: media.is_primary, url: "/media/" + media.id }]);
      }
      const variants = await env.DB.prepare(
        "SELECT id, product_id, sku, size, color, stock_on_hand, reserved_quantity FROM product_variants WHERE is_active = 1 AND product_id IN (" + placeholders + ") ORDER BY size, color LIMIT 500",
      ).bind(...productIds).all<PublicVariantRow>();
      const variantsByProduct = new Map<string, Array<PublicVariantRow & { available_quantity: number }>>();
      for (const variant of variants.results ?? []) {
        const available = Math.max(0, variant.stock_on_hand - variant.reserved_quantity);
        if (available < 1) continue;
        variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) ?? []), { ...variant, available_quantity: available }]);
      }
      return json({ products: products.map((product) => ({ ...product, variants: variantsByProduct.get(product.id) ?? [], media: mediaByProduct.get(product.id) ?? [] })) });
    } catch {
      return error("Catalogue is temporarily unavailable", 503);
    }
  }

  const publicVehicles = await publicVehicleRoutes(request, env, url);
  if (publicVehicles) return publicVehicles;

  const publicRentalDocuments = await publicRentalDocumentRoutes(request, env, url);
  if (publicRentalDocuments) return publicRentalDocuments;

  const publicRental = await publicRentalRoutes(request, env, url);
  if (publicRental) return publicRental;

  const publicWholesaleResponse = await publicWholesaleQuoteRoutes(request, env, url);
  if (publicWholesaleResponse) return publicWholesaleResponse;

  const publicDeliveryFeeResponse = await publicDeliveryFeeRoutes(request, env, url);
  if (publicDeliveryFeeResponse) return publicDeliveryFeeResponse;

  const publicOrderResponse = await publicOrderRoutes(request, env, url);
  if (publicOrderResponse) return publicOrderResponse;

  if (url.pathname === "/api/enquiries" && request.method === "POST") {
    const limited = await enforcePublicRateLimit(request, env, "enquiry", 8);
    if (limited) return limited;
    const body = await readJson(request, 12_000);
    if (!body) return error("Please submit valid form details", 400);

    // Honeypot field: bots that fill hidden fields receive a neutral success response.
    if (cleanText(body.website, 120)) return json({ accepted: true });
    if (!(await verifyTurnstile(request, body.turnstile_token))) return error("Please complete the security check and try again.", 403);
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
