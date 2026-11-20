# Admin AI Command Centre

## What is implemented

- A private AI Command Centre is available to owner, manager and catalogue roles from the Operations menu.
- The 100-file limit is per AI task, not per upload request or Gemini call. The browser automatically divides analysis into bounded provider requests, records each completed batch, and combines the batch results in the final task. The separate media-library upload endpoint accepts at most four images per HTTP request for reliable retries; the product-intake UI automatically sends all selected product photos through as many four-image storage requests as needed. This four-image transport batch does not reduce the 100-file AI task limit.
- The intake UI accepts up to 100 JPG, PNG, WebP, PDF, TXT, CSV, JSON or Markdown attachments per task. It processes images/documents in bounded batches (up to three visual/document inputs per provider request), preserves successful batch results when another batch fails, and runs a final cross-batch grouping pass for product tasks. Images are compressed in the browser; PDFs are passed as PDF data and text formats are extracted as text. Files are not exposed through a browser-side API key.
- Product intake asks Gemini to inspect each bounded image batch and return separate drafts for distinct products, including the source filenames assigned to each draft. After the individual batch analyses, the browser creates numbered, filename-labelled visual contact sheets covering the complete selected image set (up to 16 thumbnails per sheet). The global planner receives all compact sheets together plus the batch summaries and compares the whole visual catalogue before grouping candidates. Cross-batch products are merged only when the global visual match is high-confidence; uncertain candidates remain separate. The UI queues separate product drafts one at a time and uploads only the images associated with the selected draft. Different product names are never merged into one stock matrix.
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
- Natural-language chat maps six explicitly supported owner/manager actions to the authenticated server-side executor: publish one clearly identified product; publish eligible draft products; set stock for one exact SKU; update an enquiry to one of its allowed statuses; mark a requested wholesale quote as prepared; and change a vehicle status to available, maintenance or retired only when no pending/active rentals exist. Every write uses exact identifiers, role checks, conditional updates and an audit record. Preparing a quote does not send or accept it. Changing vehicle availability is blocked while rental requests are requested, reviewing, confirmed or active.
- Do not attach CNICs, identity documents, payment cards, bank credentials, passwords, OTPs, private customer records or confidential financial documents.

## Provider and cost

- Gemini keys remain in the existing encrypted D1 vault / Cloudflare server secrets. No key is placed in a `VITE_*` variable or browser bundle. A D1 task ledger stores bounded task summaries, outputs, attachment names, model used and completion events so subsequent batches can receive the same task context when the model or API key changes. Owners/managers/catalogue users can restore saved task context from recent task history. Attachment bytes are not persisted in this ledger; reattach files that still need processing. It stores outputs and decisions, not hidden chain-of-thought.
- Text and image requests are sent to the configured Gemini provider. Google Search grounding is used only for the explicit Deep research action and may incur provider charges.
- Attachment intake supports up to 100 files per task, but each provider call remains bounded to three images/documents and each PDF is isolated to control request size. Images are limited to 5 MB each and compressed to approximately 1.4 MB for AI analysis. PDFs are limited to 5 MB each. TXT/CSV/JSON/Markdown files are limited to 120,000 characters each and 150,000 combined per provider request. DOCX/XLSX text extraction is supported through the validated browser-side archive/XML parser; arbitrary archives are not accepted. A 100-file task can still pause if every configured Google project exhausts its quota; key rotation does not bypass project-level quota.

## Release validation still required

- Verify authenticated chat, image and document analysis, malformed attachment rejection, cross-batch grouping, task-memory writes, product draft creation, variant matrix, media upload, direct single-product publishing, bulk eligibility checks and audit-log writes in CI.
- Test on a physical Android phone and a desktop browser, including large images, camera-originated photos and interrupted uploads.
- Confirm the configured Gemini key/model has multimodal access and Google Search grounding enabled.
- Verify uploaded product media and generated draft data against a non-production D1/R2 environment.
- Do not enable autonomous settings changes, product publishing, payment actions, stock changes, staff access changes or destructive actions until each action has explicit role checks, a preview/approval step, idempotency where needed, audit logging and dedicated integration tests.


## Resumable bulk media pipeline — 19 November 2026

- Added the authenticated same-origin `POST /api/admin/media/bulk` endpoint for batches of up to four JPG/PNG/WebP images and 20 MB total.
- Every file has a stable client-generated UUID derived from its filename and SHA-256 content. The server validates MIME signatures, computes SHA-256 itself, and records the digest in R2 object custom metadata.
- D1 `processing` rows act as per-asset upload leases. Concurrent retries cannot both reserve the same ID; an interrupted upload can be recovered from a matching R2 object, or reclaimed after a 15-minute stale lease if the object is absent or incomplete.
- A retry with the same ID, owner, bytes and media metadata reuses the existing media record rather than creating a duplicate. Reusing an ID with different bytes or another uploader is rejected.
- Each file is processed independently and the response reports successful/reused assets and per-file failures. Successfully completed files remain available when another file fails.
- AI product intake now uploads images in bounded four-file batches and attaches confirmed media records to the draft product. It uses the same stable IDs on retries.
- Added Worker regression coverage for successful upload, safe retry reuse, and identifier/content collision rejection.
- This pipeline is now implemented in source; its latest CI run must pass before it is considered verified. Large 100-image real-device interruption/recovery testing remains required.

## Follow-up engineering audit — 19 November 2026

- AI exact-SKU stock commands now update the stock balance and append a matching `adjustment` row to `inventory_movements` in the same D1 batch, followed by the AI audit record. Inactive variants are rejected, reserved quantities cannot be undercut, and a no-op quantity does not create a zero-delta movement.
- Bulk draft publishing now reports the actual number of rows changed by the database and writes its batch audit record only when rows were published. This avoids reporting a pre-query estimate as a confirmed write when another admin changes catalogue state concurrently.
- These changes are present on `main` as of the 20 November 2026 audit. They have not been deployed to Cloudflare production.

## Production and CI evidence

- A read-only inspection of production D1 on 20 November 2026 confirmed that `ai_task_runs` and `ai_task_events` and their supporting indexes are present. Migration `0036_ai_task_continuity.sql` is already reflected in production; do not rerun it.
- The successful CI run associated with the prior AI intake head completed build, worker checks, schema checks and Playwright browser tests (79 passed; one mobile product-card test timed out once and passed on retry).
- That CI run skipped the remote D1 integration suite because the GitHub Actions Cloudflare test credentials were not configured. A green CI result is not evidence of a real production D1 migration or physical-device camera test.
- The latest verified code CI run for the redesigned AI inbox is run #1390 on commit `67775525692af88c4c63ebb12f0eb0aceab05960`. Later documentation-only commits are undergoing their own CI runs.

## Still required before production sign-off

1. Complete 100-image whole-catalogue analysis and task restoration on a physical Android device and desktop browser.
2. Confirm the configured Gemini key/model has multimodal access, sufficient quota and Google Search grounding enabled.
3. Verify uploaded product media and generated draft data against a non-production D1/R2 environment.
4. Expand direct natural-language actions only through audited, role-checked, idempotent server-side operations with dedicated integration tests.
5. Enable isolated remote D1 integration in CI using dedicated test credentials; the current GitHub Actions remote D1 step is skipped when those credentials are absent.
6. Complete provider and owner acceptance for catalogue, inventory, payment, notifications and customer-facing workflows.


## Inbox redesign — 20 November 2026

The admin AI experience is now organized as a conversation-first inbox rather than a command-centre dashboard:

- The chat is the primary workspace, with a compact header, familiar message timeline and single natural-language composer.
- A hamburger control opens a scrollable, slide-in left drawer containing recent saved AI tasks/conversations, General assistant, Product & file analysis, Deep research, manual product entry and (owner only) AI provider/key settings.
- The drawer closes by selecting a tool, tapping its close control, or using the backdrop. Reduced-motion preferences are respected.
- Saved AI task previews use the first user message. New chat tasks retain their task ID across turns; the task history stores user-message summaries alongside assistant results so previous sessions can be resumed.
- Product intake and research are modes within the same chat inbox. Product analysis still creates unpublished drafts for review; it does not publish products automatically.
- The composer accepts natural-language requests. An explicit intent mapper converts supported owner/manager requests for catalogue publishing, exact-SKU inventory, enquiry status, wholesale quote preparation and vehicle availability into the authenticated server-side action endpoint. The server remains authoritative and verifies each write.
- Supported vehicle commands are blocked if the vehicle has any requested, reviewing, confirmed or active rental. Supported wholesale preparation does not send a customer message or mark a quote accepted.
- Unsupported, ambiguous or high-impact requests stay in normal AI chat and/or the relevant business workspace; the interface must not claim that an action was executed.

### Capability boundary

Natural-language interaction is not a claim that every business workflow is already an AI-executable action. Current direct AI writes are limited to the six audited actions above. POS sales, order fulfilment/cancellation, payment verification/refunds, returns/exchanges, rental approvals and status transitions, customer communications, finance, staff permissions, settings, CMS publishing, CNIC/private files and destructive operations remain outside this direct executor until each receives its own least-privilege implementation, business-rule validation, idempotency, audit trail and integration tests. These workflows remain available through their dedicated workspaces; the assistant must not claim to have executed them.

### Release state

- Changes are committed to `main` with `skip:` commit-message prefix.
- Cloudflare Pages automatic and production deployments are intentionally disabled during this work. No production deployment is authorized by these commits.
- Run the normal type-check, Worker tests, schema checks and desktop/mobile Playwright suite before enabling any future release.


The slide-in menu also exposes the role-authorized business workspaces (overview, follow-ups, catalogue, inventory, POS, vehicles, rentals, orders, returns, exchanges, wholesale, enquiries, customers, reviews, content, notifications, staff, settings and audit history). Selecting a workspace closes the drawer and uses the existing admin navigation and role permissions; it does not duplicate or bypass the underlying workspace APIs.


## Customer AI accessibility and scanner follow-up — 20 November 2026

- The public customer assistant accepts up to three validated JPG/PNG/WebP product photos (compressed in the browser, size-limited and validated again in the Worker) and sends the image parts to the configured Gemini multimodal model. The public endpoint remains separate from the authenticated admin AI endpoint and does not accept customer CNIC or identity evidence.
- The customer chat includes Urdu/English browser speech input, spoken assistant replies, direct links to garment browsing, wholesale enquiries, car rentals, contact and customer accounts. The microphone is enabled only for the same origin by the Permissions-Policy header.
- Speech recognition is browser-dependent. Some browsers send audio to their speech service; users are informed not to speak sensitive information. Text input remains available when speech is unsupported.
- The camera scanner continues to use bundled ZXing as the broad-compatibility decoder, with native BarcodeDetector acceleration when supported. It now also attempts continuous autofocus and exposes a flash toggle on devices that advertise torch support. Product-label reading still uses the existing authenticated Gemini image-reading flow and internal SKU/barcode matching.
- The public assistant does not yet execute order, rental, payment or account changes from chat. Its shortcuts open the secure website workspaces/forms. Verified customer action APIs, contextual action cards and transaction execution remain a separate release gate.
- Browser CI verifies the public chat photo attachment flow, task shortcuts and accessibility controls. Physical Android/iOS camera, flash, speech-recognition language and real voice-output testing remains required.
- The Web Speech API and native BarcodeDetector are not universally supported; feature detection and fallbacks are intentional. See [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) and [MDN BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector).
