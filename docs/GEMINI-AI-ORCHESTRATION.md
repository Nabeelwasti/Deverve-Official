# De VERVE Gemini AI orchestration

Updated: 19 November 2026

## Runtime model order

The shared server-side Gemini caller uses this ordered model chain:

1. `gemini-3.8-flash` — primary.
2. `gemini-3.5-flash-lite` — first operational fallback; verified with HTTP 200 on the current test key.
3. `gemini-3.1-flash-lite` — second operational fallback; verified with HTTP 200 on the current test key.
4. `gemini-3.7-flash` — temporary-capacity fallback; previously timed out during testing.
5. `gemini-3.6-flash` — temporary-capacity fallback; previously timed out / returned high-demand errors.
6. `gemini-3.5-flash` — temporary-capacity fallback; previously timed out during testing.

The caller stops on the first valid generated response. It skips temporary 5xx errors, timeouts, unsupported model errors, model permission errors, and model-specific quota errors. Per-attempt timeout and total per-key budget are bounded so a single provider outage cannot hold a request indefinitely.

The 2.5 Flash and 2.5 Flash Lite IDs are intentionally excluded: the current API account returned HTTP 404 saying those models are unavailable to new users. Gemini 3.1 Pro Preview returned HTTP 429 with zero Free Tier quota. The Gemini 3.8 / 3.7 / 3.6 / 3.5 full Flash models were temporarily busy or timed out in the current test window; they remain lower-priority retry candidates, not guaranteed working models.

## API key orchestration

- The owner-managed encrypted D1 vault is the canonical ordered key pool.
- Existing Cloudflare secret slots `NabeelG_Api_key1` and `NabeelG_Api_key2` are imported into the encrypted vault when possible and remain emergency fallbacks if D1 is unavailable.
- The first enabled key is primary; remaining enabled keys are tried in priority order. A key that is cooling down is skipped.
- Keys are deduplicated by a one-way fingerprint. Plaintext key values are never returned to the browser or written to logs.
- The owner can add more Google AI Studio keys in Admin → AI & live chat. For genuinely separate quota pools, use keys from separate Google Cloud projects; multiple keys in one project share project-level quotas.
- Rate limits and free-tier allowances are not unlimited. The application must not silently enable paid billing or claim that key rotation bypasses Google's project quotas.

## Feature coverage

The same server-side Gemini model chain is used by customer AI Chat and authenticated product-label OCR. The camera scanner should decode QR/barcodes locally with the browser's native BarcodeDetector where available, or a dedicated decoder; Gemini is used for interpreting captured product-label images and extracting structured fields. A barcode decode must not be delegated solely to generative AI.

## Data and safety boundaries

- Never send CNIC evidence, customer identity documents, payment-card details, OTPs, HR records, finance records, or rental contracts to Gemini.
- OCR output is untrusted extraction, not verified product truth. Staff must review every field before saving.
- Never auto-save model-inferred prices, stock, SKU, barcode, brand or product claims without staff confirmation.
- Keep provider keys only in Cloudflare encrypted secrets / the encrypted D1 vault. Never commit secrets or paste them into source control.
- Model availability, pricing and quota policies can change. Retest and monitor provider responses before changing the production order.

## Release control

Code changes are committed to GitHub with the Cloudflare Pages skip marker. Do not deploy, call Cloudflare deployment APIs, or run Wrangler deployment commands until the owner explicitly says **deploy now**. No production D1 migration is included in this model-order change.
