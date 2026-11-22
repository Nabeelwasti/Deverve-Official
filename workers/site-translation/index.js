const LANGUAGES = new Set(["af", "am", "ar", "ast", "az", "ba", "be", "bg", "bn", "br", "bs", "ca", "ceb", "cs", "cy", "da", "de", "el", "es", "et", "fa", "ff", "fi", "fr", "fy", "ga", "gd", "gl", "gu", "ha", "he", "hi", "hr", "ht", "hu", "hy", "id", "ig", "ilo", "is", "it", "ja", "jv", "ka", "kk", "km", "kn", "ko", "lb", "ln", "lo", "lt", "lv", "mg", "mk", "ml", "mn", "mr", "ms", "my", "ne", "nl", "no", "ns", "oc", "or", "pa", "pl", "ps", "pt", "ro", "ru", "sd", "si", "sk", "sl", "so", "sq", "sr", "ss", "su", "sv", "sw", "ta", "th", "tl", "tn", "tr", "uk", "ur", "uz", "vi", "wo", "xh", "yi", "yo", "zh", "zu", "as", "brx", "doi", "kok", "ks", "mai", "mni", "sa", "sat", "te"]);

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
      const protectedBrands = [];
      const protectedText = text.replace(/\bDe VERVE\b/gi, match => {
        const token = `ZXQDVBRAND${protectedBrands.length}ZXQ`;
        protectedBrands.push(match);
        return token;
      });
      const indicTargets = {
        as: "asm_Beng", bn: "ben_Beng", brx: "brx_Deva", doi: "doi_Deva",
        gu: "guj_Gujr", hi: "hin_Deva", kn: "kan_Knda", ks: "kas_Arab",
        kok: "gom_Deva", mai: "mai_Deva", ml: "mal_Mlym", mni: "mni_Beng",
        mr: "mar_Deva", ne: "npi_Deva", or: "ory_Orya", pa: "pan_Guru",
        sa: "san_Deva", sat: "sat_Olck", sd: "snd_Arab", ta: "tam_Taml",
        te: "tel_Telu", ur: "urd_Arab"
      };
      let translatedText = "";
      let provider = "cloudflare-ai";
      try {
        if (indicTargets[targetLang]) {
          const result = await env.AI.run("@cf/ai4bharat/indictrans2-en-indic-1B", {
            text: protectedText,
            target_language: indicTargets[targetLang]
          });
          translatedText = Array.isArray(result?.translations) && typeof result.translations[0] === "string"
            ? result.translations[0].trim()
            : "";
        } else {
          const result = await env.AI.run("@cf/meta/m2m100-1.2b", {
            text: protectedText,
            source_lang: "en",
            target_lang: targetLang
          });
          translatedText = typeof result?.translated_text === "string" ? result.translated_text.trim() : "";
        }
        if (!translatedText || translatedText.length > 2_400) throw new Error("Cloudflare translation returned an invalid result");
      } catch (aiError) {
        const apiKey = typeof env.GOOGLE_TRANSLATE_API_KEY === "string" ? env.GOOGLE_TRANSLATE_API_KEY.trim() : "";
        if (!apiKey) throw aiError;
        const googleUrl = new URL("https://translation.googleapis.com/language/translate/v2");
        googleUrl.searchParams.set("key", apiKey);
        const googleResponse = await fetch(googleUrl, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ q: protectedText, source: "en", target: targetLang, format: "text" }),
          signal: AbortSignal.timeout(8_000)
        });
        if (!googleResponse.ok) throw new Error("Google Cloud Translation fallback unavailable");
        const googlePayload = await googleResponse.json();
        translatedText = typeof googlePayload?.data?.translations?.[0]?.translatedText === "string"
          ? googlePayload.data.translations[0].translatedText.trim()
          : "";
        if (!translatedText || translatedText.length > 2_400) throw new Error("Google Cloud Translation returned an invalid result");
        provider = "google-cloud-translation";
      }
      protectedBrands.forEach((brand, index) => {
        translatedText = translatedText.replaceAll(`ZXQDVBRAND${index}ZXQ`, brand);
      });
      if (!translatedText || translatedText.length > 2_400) return json({ error: "Invalid translation result" }, 502);
      return json({ translatedText, provider });
    } catch {
      return json({ error: "Translation is temporarily unavailable. Please retry or use your browser's built-in page translation." }, 503);
    }
  }
};
