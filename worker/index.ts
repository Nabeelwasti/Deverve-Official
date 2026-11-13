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
}
export interface Env {
  DB: D1Database;
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

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=60, s-maxage=120" : "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const error = (message: string, status: number): Response => json({ error: message }, status);

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validPhone(value: string): boolean {
  return /^\+?[0-9 ()-]{8,20}$/.test(value);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "allow": "GET, POST, OPTIONS" } });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return error("Cross-origin requests are not accepted", 403);

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
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 12_000) return error("Request is too large", 413);
    let body: Record<string, unknown>;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 12_000) return error("Request is too large", 413);
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return error("Please submit valid form details", 400);
    }

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
