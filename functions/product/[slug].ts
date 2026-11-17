import type { Env } from "../../worker/index";

type ProductSeoRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  retail_price_paisa: number | null;
  seo_title: string;
  seo_description: string;
};

type ProductImageRow = { id: string; alt_text: string };
type AvailabilityRow = { available: number };

type PagesContext = {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function upsertMeta(html: string, attribute: "name" | "property", key: string, content: string): string {
  // Keys are fixed application-owned metadata names, never user input.
  const expression = new RegExp(\`<meta\\\\s+[^>]*\${attribute}=["']\${key}["'][^>]*>\`, "i");
  const tag = \`<meta \${attribute}="\${key}" content="\${escapeHtml(content)}" />\`;
  if (expression.test(html)) return html.replace(expression, tag);
  return html.replace(/<\/head>/i, \`\${tag}\\n</head>\`);
}

function upsertCanonical(html: string, href: string): string {
  const expression = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
  const tag = \`<link rel="canonical" href="\${escapeHtml(href)}" />\`;
  return expression.test(html) ? html.replace(expression, tag) : html.replace(/<\/head>/i, \`\${tag}\\n</head>\`);
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const response = await context.next();
  const url = new URL(request.url);

  if (request.method !== "GET" || !response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) {
    return response;
  }

  let slug = "";
  try {
    slug = decodeURIComponent(url.pathname.slice("/product/".length)).replace(/\/+$/, "");
  } catch {
    return response;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return response;

  try {
    const product = await env.DB.prepare(
      "SELECT id, slug, name, description, retail_price_paisa, seo_title, seo_description FROM products WHERE slug = ? AND status = 'published' LIMIT 1"
    ).bind(slug).first<ProductSeoRow>();
    if (!product) return response;

    const [image, availability] = await Promise.all([
      env.DB.prepare(
        "SELECT a.id, a.alt_text FROM product_media_assets pm JOIN media_assets a ON a.id = pm.media_asset_id WHERE pm.product_id = ? AND a.status = 'ready' AND a.media_type = 'image' ORDER BY pm.is_primary DESC, pm.position ASC LIMIT 1"
      ).bind(product.id).first<ProductImageRow>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS available FROM product_variants WHERE product_id = ? AND is_active = 1 AND stock_on_hand > reserved_quantity"
      ).bind(product.id).first<AvailabilityRow>(),
    ]);

    const title = (product.seo_title.trim() || \`\${product.name} | De VERVE\`).slice(0, 180);
    const description = (product.seo_description.trim() || product.description.trim()).replace(/\s+/g, " ").slice(0, 300);
    const canonical = new URL(\`/product/\${encodeURIComponent(product.slug)}\`, url.origin).toString();
    const imageUrl = image ? new URL(\`/media/\${image.id}\`, url.origin).toString() : "";
    const hasPrice = Number.isSafeInteger(product.retail_price_paisa) && (product.retail_price_paisa ?? -1) >= 0;
    const inStock = (availability?.available ?? 0) > 0;

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description,
      brand: { "@type": "Brand", name: "De VERVE" },
      ...(imageUrl ? { image: [imageUrl] } : {}),
      ...(hasPrice ? {
        offers: {
          "@type": "Offer",
          price: ((product.retail_price_paisa ?? 0) / 100).toFixed(2),
          priceCurrency: "PKR",
          availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url: canonical,
        },
      } : {}),
    };

    let html = await response.clone().text();
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, \`<title>\${escapeHtml(title)}</title>\`);
    html = upsertMeta(html, "name", "description", description);
    html = upsertMeta(html, "property", "og:type", "product");
    html = upsertMeta(html, "property", "og:title", title);
    html = upsertMeta(html, "property", "og:description", description);
    html = upsertMeta(html, "property", "og:url", canonical);
    html = upsertMeta(html, "property", "og:site_name", "De VERVE");
    html = upsertMeta(html, "name", "twitter:card", "summary_large_image");
    html = upsertMeta(html, "name", "twitter:title", title);
    html = upsertMeta(html, "name", "twitter:description", description);
    if (imageUrl) {
      html = upsertMeta(html, "property", "og:image", imageUrl);
      html = upsertMeta(html, "name", "twitter:image", imageUrl);
      html = upsertMeta(html, "property", "og:image:alt", image?.alt_text || product.name);
    }
    html = upsertCanonical(html, canonical);

    const jsonLd = JSON.stringify(structuredData).replace(/</g, "\\u003c");
    const jsonLdTag = \`<script id="deverve-product-jsonld" type="application/ld+json">\${jsonLd}</script>\`;
    html = html.replace(/<\/head>/i, \`\${jsonLdTag}\\n</head>\`);

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  } catch {
    // SEO enhancement must never make an otherwise healthy product page unavailable.
    return response;
  }
}
