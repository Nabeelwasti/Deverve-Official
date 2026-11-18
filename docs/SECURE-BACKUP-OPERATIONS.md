# De VERVE secure backup and recovery operations

**Business account:** `deverve61@gmail.com` (Google Drive and Dropbox are separate services using the same email identity)  
**Applies to:** production D1 business records, permanent CNIC evidence metadata, and encrypted CNIC evidence files  
**Status:** manual owner-controlled process; Dropbox folder structure is ready, but no unattended Dropbox or Google Drive integration is configured

## 1. Non-negotiable evidence rules

- Keep every original CNIC image in the existing private R2 bucket under `rental-private/`. The production D1 immutability triggers and indefinite R2 retention remain the primary safeguards.
- Never email CNIC images, decrypted recovery ZIPs, passwords, raw SQL exports, or identity documents. Ordinary email is not a secure evidence vault.
- Never upload raw/unencrypted SQL exports to Drive. Never place CNIC images in public website media, public links, GitHub, analytics, AI tools, or staff personal accounts.
- Do not delete, overwrite, rename, or attempt to replace an original CNIC evidence object. The backup is an additional copy, not permission to alter the original.
- Do not put the decryption password in the same Drive folder as its encrypted backup.

## 2. Cloud backup destinations

### Dropbox connection

The Dropbox connector is connected to the verified business account (display name **Deverve**, email `deverve61@gmail.com`). The root folder `/De VERVE Business Vault` and ten category folders have been created, including `/De VERVE Business Vault/01 - CNIC Evidence (Encrypted Only)` and `/De VERVE Business Vault/02 - Database Backups (Encrypted)`. A direct shared-link check on the root returned no links. No files have been uploaded yet. This ChatGPT Dropbox connection is **not** the same as authorizing the De VERVE website or its Cloudflare Worker to upload files. No website-side Dropbox API token or unattended sync is configured. Store encrypted `.dvbackup` files only in the CNIC folder; do not create public/shared links for identity evidence. Other approved business files belong in their matching category folders. Until a separately reviewed website OAuth integration is configured, uploads from the website remain manual.

### Google Drive destination

The intended Google account is **deverve61@gmail.com**. Google Drive and Dropbox are different storage providers even when the login email is the same. The Google Drive connector is disabled by the ChatGPT workspace administrator; the owner can still sign into Drive directly in a browser. Use this folder layout:

```text
My Drive/
└── De VERVE Secure Backups/
    ├── CNIC Evidence/
    │   └── 2026/
    │       └── <rental-reference>/
    │           └── <rental-reference>-cnic-evidence.dvbackup
    └── Database Exports/
        └── 2026/
            └── <date>-deverve-production-encrypted.7z
```

### Enabling direct Google Drive integration in the website

The ChatGPT Google Drive connector being disabled does not prevent a separate De VERVE website integration. The website integration is **not yet configured**. It requires an OAuth client owned by the business:

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/) with `deverve61@gmail.com`.
2. Create or select a dedicated project named **De VERVE Secure Backup**.
3. Enable **Google Drive API** for that project.
4. Configure the OAuth consent screen. Add `deverve61@gmail.com` as an authorized test user if the app remains in testing mode.
5. Create an OAuth Client ID with application type **Web application**.
6. Add this authorized JavaScript origin: `https://deverve-official.pages.dev`.
7. Keep the OAuth Client ID. Do not paste any Google password, OAuth client secret, refresh token or recovery code into chat. A browser-based least-privilege flow needs the public Client ID, not a client secret.
8. The intended website scope is `https://www.googleapis.com/auth/drive.file`, which limits the app to files it creates or that the user explicitly opens with it. It should not request unrestricted access to the entire Drive.
9. The public Client ID must be added to the Cloudflare Pages build environment as `VITE_GOOGLE_DRIVE_CLIENT_ID`. This requires a future owner-approved configuration change and deployment; do not deploy until the owner explicitly authorizes it.

After the Client ID is configured, the app still needs its Google sign-in/upload flow, category-folder creation, resumable upload, encrypted file handling and restore tests implemented and verified. Until then, Google Drive uploads remain manual. The Client ID alone does not mean that a connection or backup has been completed.

### Uploading an encrypted CNIC backup

1. Sign in to Google Drive using the business account above. Confirm the account avatar/email before uploading.
2. Create the folders shown above. Restrict access to the business owner and only explicitly approved custodians. Do not create “Anyone with the link” sharing.
3. In Admin → Rental Requests, open the relevant rental and use **Create encrypted backup**.
4. Use a unique, strong backup password of at least 16 characters. A password manager-generated password is preferred.
5. Download the `.dvbackup` file and upload that encrypted file to the matching Drive folder. The file is encrypted in the browser before download.
6. Verify the uploaded file name and size, then retain a second encrypted copy on a physically separate, encrypted offline drive.
7. Record the backup date and rental reference in the owner-controlled backup register. Do not record the password there.

**Important:** the app currently creates one encrypted backup per rental, not one automated all-rentals archive. Repeat for each rental containing CNIC evidence. The Google Drive step is manual. ChatGPT's Google Drive connection is unavailable in this workspace because it is disabled by the workspace administrator; this does not prevent the owner from using Drive directly in a browser.

### Business-wide file classification

Use the same folder categories for matching business records:

- **Always encrypt before cloud upload:** CNIC/identity documents, D1 exports, customer contact/order data, financial statements, payment evidence, staff/HR files, contracts containing personal information, and any archive containing these records.
- **Restricted access even when not encrypted:** invoices, sales/POS reports, customer orders, quotations and operational reports. Share only with named staff who need them.
- **May be stored as ordinary files when intended for public use:** approved product photography, public marketing creatives, published brand assets and public website copy. Check that no customer or staff information is visible.
- Keep dated versions. Do not overwrite the last known-good backup. Maintain a register with file name, category, date, source, size, checksum, custodian and restore-test status. Never put passwords in the register.
- Keep at least two independent copies: a restricted cloud archive and a separately encrypted offline copy. Two providers under the same login email are not independent account-security domains.

The current website does not yet produce one complete all-business archive or upload every category automatically. Export records from their authorized workspaces, encrypt sensitive exports before upload, and keep public marketing assets separate. A full automated D1 + private R2 + business-media archive and tested restore pipeline remains a release requirement.

## 3. Password custody

- Use a different random password for each backup or a formally managed business vault entry.
- Keep the password in a reputable password manager controlled by the business owner, with recovery access documented. A sealed, access-controlled offline copy is a sensible emergency fallback.
- Never send passwords by Gmail, WhatsApp, SMS, or in the same folder as the backup.
- Enable two-step verification on the business Google account and protect its recovery email/phone.
- Review Drive sharing permissions regularly and remove access when a staff member no longer needs it.

## 4. D1 database exports

D1 contains business records and CNIC document metadata; it does **not** contain the binary CNIC images stored in R2. A D1 SQL export is therefore not a substitute for the per-rental encrypted image backups.

For a periodic database snapshot:

1. An authorized owner/operator signs in to the Cloudflare Dashboard.
2. Open Workers & Pages → D1 → `deverve-production`.
3. Use the database export/download action to export the SQL snapshot. Do not run migrations, execute SQL, or modify production as part of the export.
4. Immediately place the SQL file in a temporary local folder on an access-controlled computer.
5. Encrypt it with 7-Zip using **AES-256**, enable **Encrypt file names**, and use a strong unique password. Do not leave the plain `.sql` file in Downloads, Drive, email, or a shared folder.
6. Verify that the encrypted archive opens with the correct password and that the archive contains the SQL export. Then securely remove the temporary plaintext SQL file from the working folder and empty the recycle bin. SSD/cloud sync snapshots may retain historical copies, so use a dedicated non-synced temporary folder.
7. Upload only the encrypted archive to the restricted Drive Database Exports folder. Keep its password separately.
8. Keep a second encrypted copy on a separate offline drive.

Recommended cadence: weekly D1 snapshot, and a new per-rental CNIC evidence backup whenever a new CNIC document is accepted or replaced by an explicitly authorized process. Do not overwrite the last known-good backup; keep dated versions.

## 5. Recovery procedure

### Recovering a CNIC evidence file

1. Download the original `.dvbackup` from the restricted Drive folder to an access-controlled computer.
2. Sign in to the De VERVE admin dashboard with an authorized account.
3. Open the relevant rental's **Decrypt & download** control, select the backup and enter its separately stored password.
4. The browser validates the AES-GCM authentication tag, manifest, file sizes and image signatures before creating a recovery ZIP.
5. Open the ZIP locally and confirm the recovered image files and manifest. Treat this ZIP as unencrypted sensitive data: do not email it, upload it as-is, or leave it in a shared Downloads folder.
6. The current recovery control downloads the original image files and manifest only. **It does not write to production D1 or R2.** Re-import into a replacement system requires a separately reviewed, authorized process that preserves original evidence identifiers and object integrity.

### Recovering D1

- Restore a SQL export into a separate, newly created recovery D1 database first. Never test restoration by overwriting the live `deverve-production` database.
- Validate table counts, indexes, triggers, key relationships and application compatibility before considering a cutover.
- Keep the original production D1 untouched while validating recovery.
- Restore CNIC image objects separately from their encrypted per-rental backups or the retained original R2 bucket. Reconcile each `rental_documents` metadata record with its object key, content type, byte size and cryptographic checksum.
- The permanent CNIC immutability triggers are intentional. Do not disable or bypass them to force a restore. A reviewed recovery design must preserve the evidence and prove the restored record/object mapping before any controlled cutover.

## 6. What is and is not automated today

| Capability | Current status |
|---|---|
| Original CNIC image retention in private R2 | Enabled with indefinite retention |
| D1 protection against CNIC metadata update/delete | Production triggers verified |
| Per-rental browser-side encrypted CNIC backup | Implemented |
| CNIC backup decryption and local ZIP recovery | Implemented; does not reinsert into D1/R2 |
| Dropbox vault | Folder structure created in verified business account; no files uploaded yet; no OAuth sync |
| Google Drive upload | Manual owner upload; ChatGPT Drive connector disabled by workspace administrator; no website OAuth integration |
| Emailing CNIC backups | Not used and not recommended |
| Scheduled D1 SQL export | Not configured |
| Automated R2-to-Google-Drive replication | Not configured |
| Automated R2-to-Dropbox replication | Not configured |
| Full replacement-system CNIC import | Requires a separately reviewed recovery importer |
| Tested end-to-end disaster recovery drill | Still required |

## 7. Owner acceptance checklist

- [ ] Confirm the business owns and controls `deverve61@gmail.com`.
- [ ] Enable two-step verification and confirm account recovery access.
- [ ] Review Dropbox Business Vault membership and verify no shared links or unapproved members exist.
- [ ] Create the restricted Google Drive folder structure; verify no public links exist.
- [ ] Create encrypted CNIC backups for every existing rental with evidence and upload them.
- [ ] Create a weekly encrypted D1 export and upload it.
- [ ] Keep a second encrypted copy on a separate offline drive.
- [ ] Store passwords separately from backup files.
- [ ] Perform a restore drill on a non-production environment and record the result.
- [ ] Approve a named owner and backup custodian, with access review dates.

**Release limitation:** these procedures improve independent recovery, but they do not certify a completed disaster-recovery program until the owner has completed and documented the actual Drive/Dropbox uploads, independent copy and restore drill.
