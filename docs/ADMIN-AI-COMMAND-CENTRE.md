# Admin AI Command Centre

## What is implemented

- A private AI Command Centre is available to owner, manager and catalogue roles from the Operations menu.
- Text chat accepts up to three JPG, PNG or WebP attachments. Images are compressed in the browser for Gemini analysis and are not exposed through a browser-side API key.
- Product intake asks Gemini to extract only visible or user-supplied facts, then presents a reviewable catalogue draft.
- The draft editor supports product name, category, audience, description, retail/wholesale prices, SEO fields and size/colour stock combinations.
- The assistant can create an unpublished product draft, save its variant matrix through the existing atomic inventory endpoint, and upload/attach the selected product photos through the existing media endpoints.
- Deep research uses the existing Gemini Google Search grounding flow and displays returned source links.
- Unknown POS scans can open the AI intake screen with the scanned code prefilled.
- The former Add product shortcut has been removed from the catalogue workspace. The AI workflow is the primary intake path; a manual form remains available inside the AI workspace as a fallback.

## Permission and approval boundaries

- AI chat and product analysis require an authenticated same-origin admin session and are restricted to owner, manager and catalogue roles.
- The server reads only aggregate business counts for general context. It does not pass customer identities, customer documents, payment credentials or staff secrets to Gemini.
- Product creation is an explicit user action after review. New products are always created with status `draft`; the assistant does not publish automatically.
- Existing Worker permission checks still govern product, variant and media writes. Catalogue users cannot set purchase cost.
- Chat cannot directly change settings, publish products, adjust stock, update payments, change staff permissions, send customer messages or delete records. It can explain and recommend those workflows. Those operations require separate, narrowly scoped approval tools and audit coverage before being enabled.
- Do not attach CNICs, identity documents, payment cards, bank credentials, passwords, OTPs, private customer records or confidential financial documents.

## Provider and cost

- Gemini keys remain in the existing encrypted D1 vault / Cloudflare server secrets. No key is placed in a `VITE_*` variable or browser bundle.
- Text and image requests are sent to the configured Gemini provider. Google Search grounding is used only for the explicit Deep research action and may incur provider charges.
- Image analysis supports up to three JPG, PNG or WebP images per request. Each image is limited to 5 MB for upload and compressed to approximately 1.4 MB or less for AI analysis.

## Release validation still required

- Verify authenticated chat, image analysis, malformed-image rejection, product draft creation, variant matrix and media upload in CI.
- Test on a physical Android phone and a desktop browser, including large images, camera-originated photos and interrupted uploads.
- Confirm the configured Gemini key/model has multimodal access and Google Search grounding enabled.
- Verify uploaded product media and generated draft data against a non-production D1/R2 environment.
- Do not enable autonomous settings changes, product publishing, payment actions, stock changes, staff access changes or destructive actions until each action has explicit role checks, a preview/approval step, idempotency where needed, audit logging and dedicated integration tests.
