# De VERVE CNIC retention implementation status

## Policy
CNIC front/back images remain private until the rental is completed and an authorised owner or manager records final clearance. Clearance requires explicit confirmation that all payments/deposits, damage claims, challans/fines, fees and disputes are settled. The retention deadline is exactly 90 days after the recorded clearance timestamp. An active legal/business hold pauses deletion. Legacy records are not auto-cleared.

## Code delivered in the hardening branch
- Migration `0050_cnic_clearance_retention_workflow.sql` adds immutable clearance metadata, a 90-day due date, legal/business holds, a guarded document-delete trigger and a separate trigger that permanently preserves rental business history.
- The admin rental workspace exposes clearance and hold controls only to owner/manager roles.
- The clearance endpoint requires a completed rental, both original CNIC images, every checklist item and a meaningful reconciliation note.
- The scheduled `deverve-cnic-retention` Worker deletes only after the due date and only when no active hold exists. It removes private R2 objects first, then D1 document metadata and records a minimal audit event. R2/D1 failures are retried without deleting the rental history.
- Routine encrypted media backups exclude the `rental-private/` prefix. The 25 Nov 2026 encrypted media snapshot is a historical exception: it contains 2 legacy CNIC images and expires under the existing 90-day lifecycle no later than 23 Feb 2027. New routine media snapshots exclude `rental-private/` entirely. Because the clearance workflow is not deployed yet, no new clearance timestamp can predate that snapshot; any clearance recorded after deployment has a 90-day deadline later than the old snapshot expiry. The snapshot is not a replacement for independent CNIC recovery.

## Production gates still required
- Migration 0050 must be rehearsed on an isolated D1 clone and then applied to production before the Worker code is deployed.
- The production R2 rule `deverve-rental-cnic-indefinite` currently blocks deletion. The deployment workflow first verifies migration 0050 and the live 90-day Worker health endpoint, then removes only this exact rule while preserving all other R2 lock rules. A temporary R2 bucket test confirmed that removing a bucket-lock rule permits deletion of an existing test object; no production lock or object has been changed.
- The scheduled Worker update and production smoke must be verified.
- Existing rentals have no inferred clearance timestamp. The owner/manager must explicitly record clearance after each completed rental; the one legacy-unknown consent record remains retained.
- Customer self-service deletion-request intake and owner/manager decision/communication workflow remain a separate implementation item. Staff must continue to escalate requests to the owner and record them in the business's controlled records.
- Counsel review and formal owner signature remain pending. This record is not legal advice or proof of legal compliance.

No production rental data or CNIC objects were changed during this code work.
