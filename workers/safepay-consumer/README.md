# De VERVE Safepay webhook queue consumer

**Status: source prepared; Cloudflare Queue resources, bindings and consumer deployment are NOT configured.**

This separate Worker consumes the queue produced by the Pages Function. Pages Functions support Queue producers but not Queue consumers, so the consumer must be a separate Worker. The consumer reuses the exact signed webhook handler in `worker/index.ts`, which verifies the Safepay HMAC again, checks the persisted event digest and applies the payment/order/ledger reconciliation. A 5xx response throws so Cloudflare retries the queue message. A permanent 4xx rejection is logged and acknowledged to avoid endless retries.

## Required Cloudflare resources and bindings

1. Create a Queue named `deverve-payment-webhooks`.
2. Create a dead-letter Queue named `deverve-payment-webhooks-dlq`.
3. In the De VERVE Pages project, add a Queue producer binding:
   - Variable name: `PAYMENT_WEBHOOK_QUEUE`
   - Queue: `deverve-payment-webhooks`
   - Configure for the production environment only after owner approval.
4. In `wrangler.jsonc`, replace the D1 database ID placeholder with the exact same D1 database ID used by the Pages Function. Do not point the consumer at a different database.
5. Configure the consumer Worker secrets through Cloudflare secret settings: `SAFEPAY_ENV`, `SAFEPAY_MERCHANT_API_KEY`, `SAFEPAY_SECRET_KEY`, and `SAFEPAY_WEBHOOK_SECRET`. Do not commit these values.
6. Deploy the consumer Worker only after the queue, dead-letter queue, matching D1 binding and secrets have been reviewed.
7. Send a Safepay sandbox payment and verify: the Pages webhook returns 202 only after Queue publication; the consumer processes the event; the order and payment attempt reconcile; exactly one gateway ledger row is written; duplicate delivery does not duplicate the ledger; transient failures retry; exhausted retries appear in the dead-letter queue.

## Deployment commands (not executed)

Run from the repository root after the owner approves this separate infrastructure change and the D1 ID is configured:

```bash
npx wrangler queues create deverve-payment-webhooks
npx wrangler queues create deverve-payment-webhooks-dlq
npx wrangler deploy --config workers/safepay-consumer/wrangler.jsonc
```

The Pages Queue producer binding is configured in Cloudflare Dashboard > Workers & Pages > Pages project > Settings > Bindings > Add > Queue. Redeploying Pages is required for a new binding to take effect.

## Safety and fallback

- Without `PAYMENT_WEBHOOK_QUEUE`, the Pages webhook handler retains the existing synchronous processing path. This keeps the current deployment compatible until the Queue is configured.
- With the binding configured, the request verifies the signature, stores the provider event identity/digest in D1, publishes the raw signed body to the Queue, and only then returns HTTP 202. If Queue publication fails, the route returns 503 so Safepay can retry.
- The consumer has no Queue producer binding, so it cannot loop messages back into the queue.
- The queue payload is revalidated against its SHA-256 digest and event ID before the signed handler runs again.
- Do not enable live payments until sandbox retries, duplicate deliveries, dead-letter handling and reconciliation have been accepted.
