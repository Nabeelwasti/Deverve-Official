# De VERVE live website translation

## Architecture

- The customer-facing language selector translates visible storefront copy in place. It does not redirect or open a new tab.
- The Pages Function validates same-origin requests, supported languages, input size, per-visitor rate limits, and the shared daily inference ceiling.
- Pages calls the private `deverve-site-translation` Worker through the `TRANSLATION` service binding.
- The private Worker has a Workers AI binding named `AI`. It routes supported Indic languages to AI4Bharat IndicTrans2 and other languages to Meta `@cf/meta/m2m100-1.2b`.
- The browser sends up to three independent, bounded translation batches concurrently. It reuses verified local translations, aborts stale requests when a visitor changes language, and queues DOM changes that arrive while a translation is running. Completed sections are applied incrementally; a later rate-limit or provider error does not erase already translated sections. Selecting the same language again retries unfinished sections from the local cache.
- The language picker searches by English name, native name, or language code. The picker and translation status notices close after 10 seconds or when the visitor taps elsewhere.
- If Workers AI fails, the private Worker can fall back to Google Cloud Translation Basic (v2) using the optional server-side `GOOGLE_TRANSLATE_API_KEY` secret. The key is never sent to the browser. This fallback is inactive until an owner configures that secret.
- The `De VERVE` brand name is replaced with a protected token before inference and restored exactly afterward.
- The Worker is deployed with `workers_dev: false` and `preview_urls: false`; it is intended to be reached through the internal Pages service binding only.
- Translation text is cached in the visitor's browser local storage. Form controls, the AI chat, account areas, dialogs, code, and hidden content are excluded from the DOM translation pass.
- The selected language is remembered on the visitor's next visit; switching back to **English · Original** clears that preference and restores the source text.

## Supported customer languages

The picker includes **107 translation targets** from Meta M2M100 and the supported IndicTrans2 language set, plus **English · Original**. The list includes major world languages, lower-resource languages, and additional Indic languages such as Assamese, Bodo, Dogri, Gujarati, Kannada, Kashmiri, Konkani, Maithili, Malayalam, Manipuri, Nepali, Odia, Sanskrit, Santali, Sindhi, Tamil, Telugu, and Urdu.

The language list is searchable by English display name, native display name, or language code. The model/provider must support the selected language; where an upstream model does not return a valid translation, the Worker attempts the configured Google Cloud fallback and otherwise reports a clear temporary failure.

## Usage and cost safeguards

The Pages Function enforces these limits before inference:

- **20 website translation inference attempts per UTC day**, shared across all visitors and languages.
- **20 attempts per visitor per hour** using a one-way hash of Cloudflare's client IP header. Raw IP addresses are not stored.
- **600 characters maximum per inference request**.
- The translation Worker rejects output longer than 2,400 characters.
- A failed inference is not refunded from the daily allowance.
- The counter uses an atomic D1 upsert in the existing `public_rate_limits` table. If D1 protection is unavailable, translation fails closed.

Cloudflare currently documents a 10,000-neuron daily Workers AI free allocation. The request and input limits are deliberately conservative and intended to keep this website's normal translation traffic within that allocation. The allocation is shared at account level with any other Workers AI workloads. This is an application-level usage guard, **not a provider-side billing guarantee**: actual neuron consumption depends on model tokenization and generated output, and Cloudflare Paid-plan usage beyond the free allocation can be billed. Monitor Workers AI usage in the Cloudflare dashboard. Do not increase the daily request or character limits without reviewing current model pricing and actual neuron telemetry.

## Deployment and operations

- Source of truth: `workers/site-translation/index.js`.
- Production Worker name: `deverve-site-translation`.
- The GitHub Actions workflow `.github/workflows/deploy-site-translation.yml` deploys this Worker on changes to its source on `main` when the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets are configured. If either secret is absent, the workflow emits a warning and skips deployment rather than failing. On main-branch releases it also sends one real Urdu translation smoke request to the live Pages endpoint, checking the service binding, model response, segment delimiter, and preserved brand name; the smoke request uses the same daily quota, and it is skipped with a warning if the limit is exhausted. The current Worker was deployed through the authorized Cloudflare connection; future automatic updates require those repository secrets or another authorized deployment method.
- The Pages production and preview environments have the `TRANSLATION` service binding configured. A Pages deployment is required before a binding change takes effect in a running deployment.
- The Pages production auto-deployment setting remains disabled. Release Pages only after the current-head CI and browser acceptance tests pass.
- No provider API key is stored in browser code or exposed to customers.
- To enable Google fallback, create a Google Cloud project, enable Cloud Translation Basic (v2), enable billing, create a restricted API key, and store it only as the private Worker secret `GOOGLE_TRANSLATE_API_KEY`. The key is sent in Google's `x-goog-api-key` header, never in a URL or browser code. Restrict the key to the Cloud Translation API and set explicit daily character quotas and budget alerts; Google documents that default daily character quotas are unlimited. Basic translation has a $10 monthly credit covering the first 500,000 characters, then standard usage pricing applies. The fallback is dormant until the owner approves billing and configures the secret. Official setup: https://docs.cloud.google.com/translate/docs/setup ; API-key authentication: https://docs.cloud.google.com/translate/docs/authentication ; pricing: https://cloud.google.com/products/translate/pricing.

## Online inspiration quotes

- The storefront requests a random quote through the same-origin `/api/quotes/random` Worker route. The upstream provider is never called directly by the visitor's browser and its brand is never shown in the customer interface.
- The Worker caches a validated quote pool at the edge for up to one hour, then selects a different quote from the pool for each page visit where possible.
- The customer interface displays only the quote and its author. The curated De VERVE quote pool is an immediate local fallback and is used whenever the online feed is unavailable or returns invalid data.
- The online feed is an enhancement, not a dependency: quote loading must never delay the logo, storefront, navigation, checkout or customer chat.

## Failure behavior

- Unsupported languages, oversized input, cross-origin requests, and rate-limit violations are rejected before model inference.
- If the service binding or Workers AI is unavailable, the website remains usable in English and reports that translation is temporarily unavailable.
- Translation is best-effort machine translation. Product names, prices, SKUs, legal terms, and policies should be reviewed by a fluent human before treating translated wording as authoritative.
