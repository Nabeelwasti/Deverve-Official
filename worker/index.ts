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
  const iterations = 210_000;
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
        ? await env.DB.prepare("SELECT id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, updated_at FROM products WHERE status = ? ORDER BY updated_at DESC LIMIT ?").bind(status, limit).all<AdminProductRow>()
        : await env.DB.prepare("SELECT id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, updated_at FROM products ORDER BY updated_at DESC LIMIT ?").bind(limit).all<AdminProductRow>();
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
    const id = productMatch[1];
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
    try {
      const hash = await passwordHash(password);
      const id = crypto.randomUUID();
      const inserted = await env.DB.prepare(
        "INSERT INTO admin_users (id, email, password_hash, role) SELECT ?, ?, ?, 'owner' WHERE NOT EXISTS (SELECT 1 FROM admin_users)",
      ).bind(id, email, hash).run();
      if ((inserted.meta?.changes ?? 0) !== 1) return error("Owner setup has already been completed", 409);
      const session = await createSession(env.DB, id);
      return json({ authenticated: true, admin: { id, email, role: "owner" } }, 201, { "set-cookie": sessionCookie(session.token, 12 * 60 * 60) });
    } catch {
      return error("Owner setup could not be completed", 503);
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
      const dummyHash = "pbkdf2-sha256$210000$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
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

  if (url.pathname === "/api/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ status: "ok", database: "connected" });
    } catch {
      return error("Service temporarily unavailable", 503);
    }
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

  if (url.pathname === "/api/enquiries" && request.method === "POST") {
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
