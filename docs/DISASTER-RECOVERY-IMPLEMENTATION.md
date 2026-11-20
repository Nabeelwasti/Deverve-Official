# De VERVE disaster recovery architecture and release gates

**Last reviewed:** 20 November 2026  
**Production database:** `deverve-production` (Cloudflare D1)  
**Primary object store:** `deverve-media-private` (Cloudflare R2, APAC)  
**Current release state:** recovery design documented; unattended off-site backup and verified restore are not yet active. Cloudflare Pages deployment remains disabled.

> This document is an implementation specification and operational status record. It does not claim that a backup has been created, that a restore has succeeded, or that recovery objectives have been achieved.

## 1. Recovery objectives

Adopt a 3-2-1-1-0 strategy:

- **3 copies:** production plus two independent recoverable copies.
- **2 storage systems:** Cloudflare and a separate provider/offline medium.
- **1 off-site:** encrypted backup in the business Dropbox vault under a separately protected business identity.
- **1 immutable or offline:** immutable retention in a dedicated backup bucket and a disconnected encrypted drive.
- **0 unverified backups:** checksum validation on every backup and a scheduled restore drill.

Proposed objectives (targets, not yet achieved):

| Data class | Target RPO | Target RTO | Required control |
|---|---:|---:|---|
| D1 operational records | 24 hours | 8 hours | Daily encrypted SQL export plus D1 Time Travel |
| Public product/media assets | 24 hours | 8 hours | Object inventory, checksums and off-site object archive |
| Private rental evidence/CNIC | 15 minutes after a new accepted upload | 8 hours | Event-triggered encrypted off-site copy plus existing private R2 lock |
| Backup keys and recovery configuration | No more than one rotation interval | 4 hours | Separate password-manager escrow and owner recovery procedure |

The 15-minute CNIC objective cannot be claimed until the upload-to-backup event path, alerting and restore are implemented and tested.

## 2. Recommended architecture

### Layer A — Cloudflare-native recovery

1. Retain D1 Time Travel as the short-window point-in-time recovery layer. Its available history depends on the account plan; verify the actual configured retention in the dashboard rather than assuming a duration.
2. Add a dedicated scheduled Cloudflare Workflow for D1 export. Cloudflare's published example uses a scheduled Workflow, calls the D1 export REST API, polls the export until it is ready, downloads the SQL dump and stores it in R2. Workflow retries handle transient polling/download/storage failures.
3. Use a dedicated private R2 bucket such as `deverve-dr-backups`, separate from the live media bucket. Store immutable, timestamped objects; never overwrite the last known-good backup.
4. Configure a Bucket Lock rule on the backup prefixes (for example, `d1/`, `media/`, `rental-evidence/`) with an approved minimum retention period. The current indefinite lock on `rental-private/` is evidence protection; it is not a D1 backup.
5. Include a manifest with backup ID, database ID, export bookmark, source commit, timestamp, schema/migration fingerprint, object count, byte count and SHA-256 digests. Do not put secrets, customer details or CNIC metadata in a public manifest.

**Operational warning:** Cloudflare documents that a D1 export can make the database unavailable to serve queries while the export is running. Schedule it in a quiet window, keep the Workflow polling the export job, monitor duration and failure, and do not run overlapping exports. Test the workflow against a non-production D1 database before enabling it for production.

### Layer B — independent off-site copy

1. Use the existing business Dropbox vault as the first independent provider destination. The ChatGPT Dropbox connection and the website's Dropbox API authorization are different credentials; the existing ChatGPT connection does not authorize the Worker to upload.
2. Create a dedicated Dropbox API app with only the minimum file-write/read permissions needed for the backup folder. Store its refresh token and app secret as Cloudflare Worker secrets, never in Git, browser code, D1 rows or chat.
3. Upload only the already encrypted backup artifact. Use Dropbox upload sessions for large files, verify the returned file metadata and content hash, and record the off-site object ID in the backup manifest.
4. Keep the Dropbox account under a separate business security identity with MFA and controlled recovery. A second provider using the same email/password and recovery channel is not a fully independent security domain.
5. Keep a second encrypted copy on a disconnected, encrypted external drive. Rotate the offline drive and test it periodically.

Dropbox does not replace immutable object storage or offline copies. Provider version history is useful, but do not assume it is equivalent to WORM/object-lock retention.

### Layer C — R2 media and private evidence

- Inventory every object in the live private R2 bucket. Preserve object keys, MIME type, byte size, upload time, relevant custom metadata and SHA-256.
- Copy product media and other business assets into the dedicated backup bucket, then encrypt and replicate the backup archive off-site.
- For every new accepted CNIC evidence upload, enqueue a backup event after the original R2 object and D1 metadata are successfully committed. Copy the original without modifying or deleting it; encrypt the copy before off-site upload.
- Keep all CNIC files private. Do not create public R2 URLs, shared links, email attachments or AI-chat uploads for identity evidence.
- Do not use a single D1 export as a substitute for binary R2 files. D1 stores metadata and references; R2 stores the actual objects.

## 3. Encryption and integrity

- Encrypt backup payloads client-side or in the dedicated backup Worker using AES-256-GCM with a fresh random nonce per artifact. Use authenticated encryption; never reuse a nonce with the same key.
- Compress before encryption. Keep the original timestamped encrypted object immutable.
- Store the encryption key outside both Cloudflare and Dropbox in a business password manager with a separately controlled emergency escrow copy. Keep a key version identifier in the manifest, never the key itself.
- Rotate keys through a documented dual-key restore window. Do not retire an old key until every backup encrypted with it has expired or been re-encrypted and a restore has passed.
- Compute SHA-256 for the source export and final encrypted object. Verify integrity after upload and again before restore.
- Do not log plaintext SQL, passwords, API tokens, encryption keys, customer contact details or identity-document content.

## 4. Backup schedule

Proposed schedule once implemented:

| Job | Frequency | Destination |
|---|---|---|
| D1 SQL export | Daily, low-traffic window | Private R2 backup bucket, then encrypted Dropbox off-site |
| Product/public media archive | Daily incremental; weekly full inventory reconciliation | R2 backup bucket and Dropbox |
| New private rental evidence | Event-triggered after successful upload | Encrypted R2 backup object and Dropbox off-site |
| Backup manifest/checksum audit | After every job | D1 backup ledger and owner-visible alert |
| Offline encrypted copy | Weekly | Disconnected encrypted external drive |
| Restore drill | Monthly automated isolated smoke restore; quarterly full restore exercise | Isolated recovery environment |

Proposed retention: 35 daily D1 snapshots in R2, 12 monthly encrypted off-site snapshots, and the owner-approved legal retention schedule for private rental evidence. Configure the object-lock retention to exceed the deletion/lifecycle window. Confirm legal retention and cost with the business owner before enabling a retention rule; do not apply a broad indefinite lock to every backup object without reviewing storage growth and deletion obligations.

## 5. Restore runbook

### D1 restore

1. Declare an incident and freeze deployments, migrations and non-essential writes.
2. Identify the last known-good backup and its manifest. Verify the source commit, export bookmark, schema fingerprint, object hash and encryption-key version.
3. Restore into a **new isolated D1 database**. Do not import over production as the first recovery test.
4. Decrypt and verify the artifact before import. Import the SQL dump using the supported D1 import flow or Wrangler tooling.
5. Validate schema, indexes, triggers, foreign keys, migration fingerprint, critical row counts and representative business records.
6. Run application smoke tests against the isolated database: admin login, catalogue/variant lookup, stock reservations, order reads, rental reads, customer access boundaries and audit history.
7. Record discrepancies and obtain owner approval before any production cutover.

### R2 restore

1. Restore objects to a new isolated bucket, preserving object keys and metadata.
2. Verify every restored object's SHA-256, size and MIME type against the manifest.
3. Confirm private evidence objects remain private and that the application can retrieve them only through authorized rental-document routes.
4. Test product image delivery and private CNIC access with authorized and unauthorized test roles.
5. Do not replace or delete the original production evidence objects during the test.

### Cutover

- Require an incident owner, recovery operator and business owner sign-off.
- Use a documented DNS/Pages/Worker cutover plan with a rollback point.
- Do not re-enable production deployment or run destructive migrations as part of an unreviewed recovery.
- Record RPO/RTO achieved, data loss window, restored object count, failed objects and corrective actions.

## 6. Monitoring and failure handling

Every backup run must report:

- started/completed timestamps, duration and source bookmark;
- D1 export status and polling attempts;
- SQL/object byte counts and SHA-256;
- number of media and private evidence objects copied;
- R2 write result, Dropbox upload result and off-site verification;
- encryption key version;
- backup age and current RPO status;
- last successful restore drill and result.

A failed job must alert the owner through a configured business notification channel, retry transient failures with bounded backoff, preserve the last known-good backup and never delete the source object. If the latest successful backup exceeds the RPO, display a clear recovery warning in the owner dashboard.

## 7. Current verified status — 20 November 2026

- Production D1 was inspected read-only during the project audit. No production data was changed by that inspection.
- Production contains the expected schema structures for AI task continuity and order inventory reservations.
- The live R2 bucket is private; its managed public `r2.dev` endpoint is disabled.
- An enabled indefinite R2 Bucket Lock rule protects the `rental-private/` prefix. This protects the matching evidence objects against overwrite/delete while the rule remains enabled; it does not back up D1 or create an independent provider copy.
- The Cloudflare account Queue listing returned no queues. The Safepay queue producer/consumer and DLQ remain unconfigured.
- The existing secure-backup operations document describes a manual encrypted CNIC and D1 export process. Dropbox folder structure exists, but the De VERVE Worker does not have a Dropbox API token or unattended upload integration.
- No scheduled D1 Workflow export, dedicated backup bucket, automated media/evidence replication, independent encrypted off-site D1 archive or successful isolated restore drill has been verified.
- No production backup export was initiated during this implementation because Cloudflare documents that D1 export can temporarily block database queries; a controlled low-traffic window and a configured destination are required.

**Release verdict: disaster recovery is not production-ready yet.** The architecture is specified, but the automated jobs, secrets, off-site copy, alerts and restore drill remain implementation gates. Do not describe the system as protected by automated disaster recovery until all gates pass.

## 8. Required configuration before activation

- [ ] Create a dedicated private R2 backup bucket in the approved region.
- [ ] Approve backup retention and configure lock rules only for the dedicated backup prefixes.
- [ ] Implement and deploy the scheduled D1 export Workflow in a non-production environment first.
- [ ] Create a dedicated Dropbox API app with least-privilege scopes and a separate business security identity.
- [ ] Add backup encryption key, key version, Dropbox refresh token and required Cloudflare account/database identifiers as Worker secrets.
- [ ] Implement the R2 object inventory/copy and event-triggered private evidence backup.
- [ ] Implement checksums, manifests, owner alerts, retry policy and backup-age dashboard.
- [ ] Perform a full isolated D1 + R2 + CNIC evidence restore drill.
- [ ] Record measured RPO/RTO and obtain business owner sign-off.
- [ ] Only then consider a separately authorized production deployment.

## 9. Official technical references

- [Cloudflare Workflows: Export and save D1 database to R2](https://developers.cloudflare.com/workflows/examples/backup-d1/)
- [Cloudflare D1 API: Export database as SQL](https://developers.cloudflare.com/api/go/resources/d1/subresources/database/methods/export/)
- [Cloudflare D1: Import and export data](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Cloudflare R2: Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
- [Cloudflare R2 API: Set bucket lock rules](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/locks/methods/update/)


## 10. Live infrastructure follow-up — 20 November 2026

A subsequent Cloudflare API read-back and non-destructive R2 object comparison refined the status above:

- A dedicated APAC bucket named `deverve-db-backups` already exists. It was empty at the time of inspection, so it is a configured destination, **not evidence of a completed D1 backup**.
- Bucket Lock rules were configured and read back successfully on `deverve-db-backups`: `d1/` and `media/` objects have a 35-day minimum retention; `rental-private/` objects are retained indefinitely. These rules do not create objects, encryption, off-account copies or a restore service.
- A dated R2 restore-drill bucket already contained 15 copies of the 15 objects currently listed in `deverve-media-private`. A read-only comparison found no missing/extra keys and matching object sizes and ETags, totalling 1,522,058 bytes. This is a successful object-list consistency check at the time of comparison; it is **not** a SHA-256 verification, a D1 restore, or proof of recovery from Cloudflare account loss.
- That restore-drill bucket contains private `rental-private/` evidence copies. An indefinite Bucket Lock rule was added and read back successfully for that prefix, aligning the backup copy's deletion/overwrite protection with the source bucket's existing indefinite lock. The bucket remains private.
- The primary `deverve-media-private` bucket's existing indefinite `rental-private/` lock remains enabled.
- The separate `deverve-db-backups` bucket and restore-drill bucket are still in the same Cloudflare account as production. They improve recovery from accidental object loss but are not an independent security/account boundary.
- The database backup bucket still contains no D1 SQL export. No production D1 export was initiated because the documented export process can temporarily block database queries.
- No Dropbox API app/token, encrypted off-account archive, offline copy, automated alerting, scheduled Workflow or successful isolated D1 import/restore was verified.

**Updated verdict:** R2 media object-copy consistency has been checked and retention controls have been strengthened. Full disaster recovery remains **not production-ready** until encrypted D1 backups, independent off-account storage, SHA-256 verification, automated monitoring and an isolated D1 + R2 restore drill all pass.

## 11. Immediate next implementation gates

1. Build and test the scheduled D1 export Workflow against a non-production D1 database first; use bounded polling, retry/backoff, an overlap guard and a low-traffic schedule.
2. Encrypt each backup artifact with AES-256-GCM using a unique nonce and a key held outside Cloudflare and Dropbox; record only the key version.
3. Upload the encrypted D1 dump and manifest under timestamped, write-once object keys in `deverve-db-backups/d1/`. Do not overwrite a previous successful backup.
4. Add an independently controlled Dropbox destination with a dedicated least-privilege API app and MFA-protected business identity. Verify Dropbox's returned content hash against its documented block-hash algorithm; a successful HTTP upload alone is not verification.
5. Add a separate offline encrypted copy and test key escrow/recovery.
6. Perform an isolated D1 import into a newly created non-production database, validate schema/data/integrity and exercise application smoke tests. Keep production untouched.
7. Add a monthly automated restore smoke test, quarterly full restore exercise and owner-visible alert when the last successful backup exceeds the target RPO.
8. Only after the isolated process passes should a production backup schedule be enabled, during a controlled quiet window and with a documented maintenance notice/monitoring plan.
