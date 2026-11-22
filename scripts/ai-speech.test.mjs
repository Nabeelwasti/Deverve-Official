import test from "node:test";
import assert from "node:assert/strict";
import { generateGeminiSpeech, speechWavFromPcm } from "../.test-dist/worker/index.js";

const originalFetch = globalThis.fetch;
const pcm = Buffer.alloc(160, 0x12);
const encodedPcm = pcm.toString("base64");

test("PCM speech output is wrapped in a valid mono 24 kHz WAV container", () => {
  const wav = speechWavFromPcm(new Uint8Array(pcm));
  assert.equal(Buffer.from(wav.subarray(0, 4)).toString("ascii"), "RIFF");
  assert.equal(Buffer.from(wav.subarray(8, 12)).toString("ascii"), "WAVE");
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), pcm.length);
  assert.equal(wav.length, 44 + pcm.length);
});

test("Gemini speech adapter keeps the API key server-side and returns valid WAV audio", async () => {
  let requestUrl = "";
  let requestHeaders = new Headers();
  let requestBody = {};
  globalThis.fetch = async (input, init = {}) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init.headers);
    requestBody = JSON.parse(String(init.body || "{}"));
    return new Response(JSON.stringify({
      output_audio: { data: encodedPcm, mime_type: "audio/pcm;rate=24000" }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await generateGeminiSpeech("server-only-key", "Speak this in Urdu.", "ur-PK", "Kore");
    assert.equal(result.ok, true);
    assert.equal(result.model, "gemini-3.1-flash-tts-preview");
    assert.equal(requestUrl, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(requestHeaders.get("x-goog-api-key"), "server-only-key");
    assert.equal(requestBody.model, "gemini-3.1-flash-tts-preview");
    assert.deepEqual(requestBody.response_format, { type: "audio" });
    assert.deepEqual(requestBody.generation_config.speech_config, [{ voice: "Kore" }]);
    assert.equal(Buffer.from(result.audio.subarray(0, 4)).toString("ascii"), "RIFF");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini speech adapter retries the secondary supported model when the preview model is unavailable", async () => {
  const models = [];
  globalThis.fetch = async (_input, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    models.push(body.model);
    if (models.length === 1) {
      return new Response(JSON.stringify({ error: { message: "model not found" } }), {
        status: 404, headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      output_audio: { data: encodedPcm, mime_type: "audio/pcm;rate=24000" }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await generateGeminiSpeech("server-only-key", "Hello.", "en-US", "Kore");
    assert.equal(result.ok, true);
    assert.deepEqual(models, ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]);
    assert.equal(result.model, "gemini-2.5-flash-preview-tts");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini speech adapter rejects malformed audio rather than returning a broken player response", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    output_audio: { data: "not-valid-base64", mime_type: "audio/pcm" }
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await generateGeminiSpeech("server-only-key", "Hello.", "auto", "Kore");
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
