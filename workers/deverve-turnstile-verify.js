export default {
  async fetch(request, env) {
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    };
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        secret_configured: Boolean(env.TURNSTILE_SECRET),
        hostname: "deverve-official.pages.dev"
      }), { status: env.TURNSTILE_SECRET ? 200 : 503, headers });
    }
    if (request.method !== "POST") return new Response(JSON.stringify({ success: false }), { status: 405, headers });
    if (request.headers.get("origin") !== "https://deverve-official.pages.dev") {
      return new Response(JSON.stringify({ success: false }), { status: 403, headers });
    }
    let body;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ success: false }), { status: 400, headers });
    }
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token || token.length > 2048) return new Response(JSON.stringify({ success: false }), { status: 400, headers });
    const form = new FormData();
    form.set("secret", env.TURNSTILE_SECRET);
    form.set("response", token);
    const remoteIp = request.headers.get("cf-connecting-ip");
    if (remoteIp) form.set("remoteip", remoteIp);
    let result;
    try {
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
      result = await response.json();
    } catch {
      return new Response(JSON.stringify({ success: false }), { status: 503, headers });
    }
    const valid = result?.success === true && result?.hostname === "deverve-official.pages.dev";
    return new Response(JSON.stringify({ success: valid }), { status: valid ? 200 : 403, headers });
  }
};
