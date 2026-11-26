# De VERVE application secret hierarchy

## Purpose-separated application keys
The provisioning workflow creates two Cloudflare Pages production secrets:
- `AI_KEYS_ENCRYPTION_KEY`: AES-GCM key for newly stored Gemini provider credentials.
- `CNIC_PREVIEW_HMAC_KEY`: HMAC key for new short-lived CNIC preview signatures.

They are independent random 256-bit secrets. The owner generated both values locally and entered them directly as Cloudflare Pages `secret_text` bindings; neither value was shared in chat, committed, or stored in GitHub. They are not derived from `D1_BACKUP_ENCRYPTION_KEY` or `ADMIN_BOOTSTRAP_TOKEN`. The non-secret `APP_SECRET_HIERARCHY_VERSION=1` marker is configured and prevents accidental regeneration if a key is later missing. The guarded provisioning workflow verifies the marker and refuses to overwrite existing keys. This removes `ADMIN_BOOTSTRAP_TOKEN` from new AI-key encryption and CNIC preview signatures. CNIC preview verification uses only `CNIC_PREVIEW_HMAC_KEY`; a preview link issued before the controlled deployment may need to be refreshed, and all links expire after two minutes.

## Migration and rotation
- Existing Gemini vault rows encrypted with the legacy bootstrap-derived key remain decryptable.
- When an owner/manager opens the AI key vault after the new secret bindings exist, the Worker re-encrypts legacy rows with `AI_KEYS_ENCRYPTION_KEY` and records an audit event.
- Do not rotate `ADMIN_BOOTSTRAP_TOKEN` until the AI key vault reports `legacy_keys_remaining = 0` and the owner has verified key access.
- The provisioning workflow checks existing bindings and patches only the two new names; a temporary Pages project test verified that this PATCH operation preserves unrelated environment variables.

## Important limitation
The two application keys are stored as encrypted Cloudflare Pages production secrets. The owner reports keeping them in a protected Notepad and securing a separate recovery copy; this has not been independently restored from off-account custody. Losing either key would affect the corresponding encrypted data or preview flow. Independent off-account disaster recovery remains outstanding. Never paste any of these secrets into chat, source code, issues or logs.
