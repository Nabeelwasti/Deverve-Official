# De VERVE application secret hierarchy

## Purpose-separated application keys
The provisioning workflow creates two Cloudflare Pages production secrets:
- `AI_KEYS_ENCRYPTION_KEY`: AES-GCM key for newly stored Gemini provider credentials.
- `CNIC_PREVIEW_HMAC_KEY`: HMAC key for new short-lived CNIC preview signatures.

They are independently derived with HKDF-SHA256 from the existing 32-byte `D1_BACKUP_ENCRYPTION_KEY`, using different fixed salt/info labels. This removes `ADMIN_BOOTSTRAP_TOKEN` from new AI-key encryption and new CNIC preview signatures. Existing preview tokens retain a short legacy verification overlap; they expire after two minutes.

## Migration and rotation
- Existing Gemini vault rows encrypted with the legacy bootstrap-derived key remain decryptable.
- When an owner/manager opens the AI key vault after the new secret bindings exist, the Worker re-encrypts legacy rows with `AI_KEYS_ENCRYPTION_KEY` and records an audit event.
- Do not rotate `ADMIN_BOOTSTRAP_TOKEN` until the AI key vault reports `legacy_keys_remaining = 0` and the owner has verified key access.
- The provisioning workflow checks existing bindings and patches only the two new names; a temporary Pages project test verified that this PATCH operation preserves unrelated environment variables.

## Important limitation
These are purpose-separated child keys, not independent random root secrets. Loss or compromise of `D1_BACKUP_ENCRYPTION_KEY` affects D1/R2 backup recovery and the two derived application keys. The independent off-account/offline recovery and separate application-key escrow remain deferred until the business has its domain and business email. Never paste any of these secrets into chat, source code, issues or logs.
