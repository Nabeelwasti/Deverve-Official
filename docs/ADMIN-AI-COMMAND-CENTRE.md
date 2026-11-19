# Admin AI Command Centre

## What is implemented

- A private AI Command Centre is available to owner, manager and catalogue roles from the Operations menu.
- The intake UI accepts up to 100 JPG, PNG, WebP, PDF, TXT, CSV, JSON or Markdown attachments per task. It processes images/documents in bounded batches (up to three visual/document inputs per provider request), preserves successful batch results when another batch fails, and runs a final cross-batch grouping pass for product tasks. Images are compressed in the browser; PDFs are passed as PDF data and text formats are extracted as text. Files are not exposed through a browser-side API key.
- Product intake asks Gemini to inspect each bounded image batch and return separate drafts for distinct products, including the source filenames assigned to each draft. A second planning pass compares all successful batch summaries together and identifies likely same-product, different-product and colour-variant groups. The UI queues separate product drafts one at a time and uploads only the images associated with the selected draft. Different product names are never merged into one stock matrix.
- The draft editor supports product name, category, audience, description, retail/wholesale prices, SEO fields and size/colour stock combinations.
- The assistant can create an unpublished product draft, save its variant matrix through the existing atomic inventory endpoint, and upload/attach the selected product photos through the existing media endpoints.
- Deep research uses the existing Gemini Google Search grounding flow and displays returned source links.
- Unknown POS scans can open the AI intake screen with the scanned code prefilled.
- The former Add product shortcut has been removed from the catalogue workspace. The AI workflow is the primary intake path; a manual form remains available inside the AI workspace as a fallback.

## Permission and approval boundaries

- AI chat and product analysis require an authenticated same-origin admin session and are restricted to owner, manager and catalogue roles.
- The server reads only aggregate business counts for general context. It does not pass customer identities, customer documents, payment credentials or staff secrets to Gemini.
- Product intake creates an unpublished draft. Owner and manager roles also have a separate direct-command executor: `publish product <exact name, slug or ID>` publishes one matching product immediately and `publish all draft products` publishes only eligible drafts. Bulk eligibility requires a non-empty product name and category, a retail price, and at least one active size/colour variant with available stock. Ineligible drafts remain drafts and are counted as skipped.
- Direct publishing writes an audit-log record with the actor, action, product/batch reference and command metadata. The endpoint reports success only after the database confirms the write.
- Existing Worker permission checks still govern product, variant and media writes. Catalogue users cannot set purchase cost.
- The natural-language chat endpoint remains read-only. Direct product publishing is available only through the separate owner/manager command endpoint. Settings, stock adjustments, payments, staff access, customer messaging and destructive record operations are not yet implemented as direct AI actions; do not claim otherwise.
- Do not attach CNICs, identity documents, payment cards, bank credentials, passwords, OTPs, private customer records or confidential financial documents.

## Provider and cost

- Gemini keys remain in the existing encrypted D1 vault / Cloudflare server secrets. No key is placed in a `VITE_*` variable or browser bundle. A D1 task ledger stores bounded task summaries, outputs, attachment names, model used and completion events so subsequent batches can receive the same task context when the model or API key changes. Owners/managers/catalogue users can restore saved task context from recent task history. Attachment bytes are not persisted in this ledger; reattach files that still need processing. It stores outputs and decisions, not hidden chain-of-thought.
- Text and image requests are sent to the configured Gemini provider. Google Search grounding is used only for the explicit Deep research action and may incur provider charges.
- Attachment intake supports up to 100 files per task, but each provider call remains bounded to three images/documents and each PDF is isolated to control request size. Images are limited to 5 MB each and compressed to approximately 1.4 MB for AI analysis. PDFs are limited to 5 MB each. TXT/CSV/JSON/Markdown files are limited to 120,000 characters each and 150,000 combined per provider request. DOCX/XLSX and arbitrary archives are not supported yet. A 100-file task can still pause if every configured Google project exhausts its quota; key rotation does not bypass project-level quota.

## Release validation still required

- Verify authenticated chat, image and document analysis, malformed attachment rejection, cross-batch grouping, task-memory writes, product draft creation, variant matrix, media upload, direct single-product publishing, bulk eligibility checks and audit-log writes in CI.
- Test on a physical Android phone and a desktop browser, including large images, camera-originated photos and interrupted uploads.
- Confirm the configured Gemini key/model has multimodal access and Google Search grounding enabled.
- Verify uploaded product media and generated draft data against a non-production D1/R2 environment.
- Do not enable autonomous settings changes, product publishing, payment actions, stock changes, staff access changes or destructive actions until each action has explicit role checks, a preview/approval step, idempotency where needed, audit logging and dedicated integration tests.
