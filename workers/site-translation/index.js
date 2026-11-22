const LANGUAGES = new Set([
  "ar", "bn", "de", "es", "fa", "fr", "hi", "id", "it", "ja",
  "ko", "ms", "pt", "ru", "th", "tr", "ur", "vi", "zh"
]);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  }
});

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 8_000) return json({ error: "Request too large" }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid translation request" }, 400);
    }

    const text = typeof body?.text === "string" ? body.text : "";
    const targetLang = typeof body?.target_lang === "string" ? body.target_lang : "";
    if (!text.trim() || text.length > 600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
      return json({ error: "Translate text in sections of up to 600 characters" }, 400);
    }
    if (!LANGUAGES.has(targetLang)) return json({ error: "Unsupported translation language" }, 400);

    try {
      const result = await env.AI.run("@cf/meta/m2m100-1.2b", {
        text,
        source_lang: "en",
        target_lang: targetLang
      });
      const translatedText = typeof result?.translated_text === "string" ? result.translated_text.trim() : "";
      if (!translatedText || translatedText.length > 2_400) return json({ error: "Invalid translation result" }, 502);
      return json({ translatedText });
    } catch {
      return json({ error: "Translation is temporarily unavailable" }, 503);
    }
  }
};
