import test from "node:test";
import assert from "node:assert/strict";
import translationWorker from "../workers/site-translation/index.js";

const request = (body, method = "POST") => new Request("https://internal.deverve/translate", {
  method,
  headers: { "content-type": "application/json" },
  body: method === "POST" ? JSON.stringify(body) : undefined
});

test("private translation worker uses IndicTrans2 for Urdu and preserves De VERVE", async () => {
  const calls = [];
  const response = await translationWorker.fetch(request({ text: "Welcome to De VERVE", target_lang: "ur" }), {
    AI: { run: async (model, input) => {
      calls.push({ model, input });
      return { translations: ["ZXQDVBRAND0ZXQ میں خوش آمدید"] };
    } }
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).translatedText, "De VERVE میں خوش آمدید");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "@cf/ai4bharat/indictrans2-en-indic-1B");
  assert.deepEqual(calls[0].input, { text: "Welcome to ZXQDVBRAND0ZXQ", target_language: "urd_Arab" });
});

test("private translation worker uses the multilingual model for non-Indic languages", async () => {
  const calls = [];
  const response = await translationWorker.fetch(request({ text: "Welcome to De VERVE", target_lang: "es" }), {
    AI: { run: async (model, input) => {
      calls.push({ model, input });
      return { translated_text: "Bienvenido a ZXQDVBRAND0ZXQ" };
    } }
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).translatedText, "Bienvenido a De VERVE");
  assert.equal(calls[0].model, "@cf/meta/m2m100-1.2b");
  assert.deepEqual(calls[0].input, { text: "Welcome to ZXQDVBRAND0ZXQ", source_lang: "en", target_lang: "es" });
});

test("private translation worker rejects invalid, oversized and unsupported requests before inference", async () => {
  let calls = 0;
  const env = { AI: { run: async () => { calls += 1; return { translated_text: "translated" }; } } };
  const unsupported = await translationWorker.fetch(request({ text: "Hello", target_lang: "xx" }), env);
  const oversized = await translationWorker.fetch(request({ text: "x".repeat(601), target_lang: "ur" }), env);
  const invalidMethod = await translationWorker.fetch(request({}, "GET"), env);
  assert.equal(unsupported.status, 400);
  assert.equal(oversized.status, 400);
  assert.equal(invalidMethod.status, 405);
  assert.equal(calls, 0);
});

test("private translation worker handles inference failures without exposing provider details", async () => {
  const response = await translationWorker.fetch(request({ text: "Hello", target_lang: "ur" }), {
    AI: { run: async () => { throw new Error("private provider diagnostic"); } }
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Translation is temporarily unavailable" });
});
