import { handleRequest, type Env } from "../../worker/index";

type SafepayQueueMessage = {
  rawBody: string;
  signature: string;
  eventId: string;
  payloadDigest: string;
};

type QueueMessage = { body: SafepayQueueMessage };
type QueueBatch = { messages: QueueMessage[] };

type ConsumerEnv = Pick<Env,
  "DB" | "SAFEPAY_ENV" | "SAFEPAY_MERCHANT_API_KEY" | "SAFEPAY_SECRET_KEY" |
  "SAFEPAY_WEBHOOK_SECRET" | "SAFEPAY_LIVE_ENABLED"
>;

function validMessage(value: unknown): value is SafepayQueueMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.rawBody === "string" && item.rawBody.length > 0 && item.rawBody.length <= 65_536
    && typeof item.signature === "string" && item.signature.length <= 256
    && typeof item.eventId === "string" && /^evt_[A-Za-z0-9_-]{12,150}$/.test(item.eventId)
    && typeof item.payloadDigest === "string" && /^[A-Za-z0-9_-]{43}$/.test(item.payloadDigest);
}

export default {
  async queue(batch: QueueBatch, env: ConsumerEnv): Promise<void> {
    for (const message of batch.messages) {
      if (!validMessage(message.body)) {
        console.error("[safepay-queue] rejected malformed internal queue message");
        throw new Error("Malformed Safepay queue message");
      }
      const payload = message.body;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload.rawBody));
      const actualDigest = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
      let eventToken = "";
      try { eventToken = String((JSON.parse(payload.rawBody) as Record<string, unknown>).token ?? ""); } catch { /* handler returns a retryable invalid-payload response */ }
      if (actualDigest !== payload.payloadDigest || eventToken !== payload.eventId) {
        console.error("[safepay-queue] queued payload identity/digest mismatch", payload.eventId);
        throw new Error("Safepay queue payload integrity check failed");
      }
      const request = new Request("https://internal.deverve.invalid/api/webhooks/safepay", {
        method: "POST",
        headers: { "content-type": "application/json", "X-SFPY-SIGNATURE": payload.signature },
        body: payload.rawBody,
      });
      // The webhook route re-verifies the provider HMAC and event identity.
      // This consumer intentionally has no Queue producer binding, preventing loops.
      const response = await handleRequest(request, env as unknown as Env);
      if (response.status >= 500) {
        throw new Error("Safepay event processing failed; Cloudflare Queue must retry");
      }
      if (response.status >= 400) {
        console.error("[safepay-queue] permanent webhook rejection", response.status, payload.eventId);
      }
    }
  },
};
