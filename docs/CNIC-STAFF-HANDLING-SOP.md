# De VERVE — Rental CNIC handling and deletion-request SOP

**Policy owner:** De VERVE business owner  
**Applies to:** owner, specifically authorised rental managers and rental staff  
**Effective policy version:** rental-cnic-2026-11-21-v1  
**Status:** Owner policy recorded. The technical 90-day deletion workflow is not yet production-enabled; see the control limitations below.

## 1. Allowed purpose

Use both sides of the renter's CNIC only for identity matching, rental request approval, fraud prevention, vehicle/security risk management and relevant rental-history or incident verification. Do not use it for marketing, unrelated profiling, public display or unrelated business activity.

## 2. Access rules

- CNIC images may be viewed only by the owner and specifically authorised rental managers/staff who need them for the relevant rental.
- Use individual staff accounts. Never share logins.
- View/download only from the authenticated rental workspace. Every view/download should create an audit record.
- Never send CNIC images or full CNIC numbers through email, WhatsApp, social media, AI chat, ordinary support tickets or GitHub.
- Do not save images to personal phones, galleries, personal cloud accounts, USB devices or unmanaged computers.
- Do not include CNIC images or full numbers in staff notes, customer messages, exports, screenshots, analytics or logs.
- Revoke access immediately when a staff member changes role or leaves.

## 3. Full financial and incident clearance

The 90-day retention clock begins only after an authorised owner/manager confirms all of the following are settled and reconciled:

- All rental charges and payments, including deposits, balances and adjustments.
- Damage assessments, repair charges and related claims.
- Challans, fines, penalties, tolls or other charges attributable to the rental, where applicable.
- Late-return, excess-mileage, fuel, cleaning, recovery or other agreed fees, where applicable.
- Any dispute, chargeback, accident, claim, investigation or other relevant unresolved matter.

Vehicle return or a status of completed is not sufficient by itself. Partial payment is not clearance. If anything remains unresolved, do not record full clearance and do not start the 90-day period.

## 4. Clearance record

When the above checks are complete, the owner/authorised manager should create a controlled record containing:

- Rental reference (not the CNIC number).
- Clearance decision and timestamp in Pakistan Standard Time / ISO 8601.
- Name and individual account ID of the approving manager.
- Confirmation that each applicable amount/obligation was reconciled.
- Reference to supporting finance/incident records, without embedding CNIC images.
- Calculated deletion due date: clearance timestamp + 90 calendar days.
- Any hold or exception, with its reason and review date.

A correction must be made as a new audited event; do not silently reset the clearance timestamp.

## 5. Customer deletion request

1. Acknowledge the request through the published De VERVE contact channel. Ask for the rental reference and enough information to verify the requester. Do not ask the customer to resend CNIC images over WhatsApp or email.
2. Register the request with date/time, channel, rental reference and staff member. Do not record the full CNIC number or image in the request log.
3. Check the rental's payments, damages, charges, challans and related obligations. Identify whether the 90-day period has started and whether it has expired.
4. Check whether a documented legal hold, active dispute, claim, accident, investigation or other applicable requirement prevents deletion.
5. Staff prepare a recommendation. Only the owner or a specifically authorised manager decides and records approval or refusal/deferment with reasons.
6. Tell the customer the outcome, expected review/deletion date or reason for deferral. Do not promise immediate deletion before all copies have been addressed.
7. If approved and eligible, the authorised operator must verify deletion from primary R2 storage, any replicas/exports and each controlled backup destination. Record the result and any remaining expiry period.
8. Keep only a minimal audit record where appropriate; never preserve the CNIC image or full CNIC number inside the decision log.

## 6. Holds and exceptions

A hold must be documented with a specific rental reference, reason, scope, authorising owner/manager, start date, review date and release decision. Review holds periodically. When the reason ends, record the release and recalculate the remaining retention period from the original full-clearance timestamp. A hold must not become a silent permanent extension.

## 7. Current technical limitations — do not bypass

The production system has not yet implemented the complete clearance, request-review, hold and 90-day deletion workflow. Current D1 triggers block deletion of rental-document metadata. Cloudflare R2 bucket-lock rules currently protect the rental-private/ prefix indefinitely in both the private media bucket and the backup bucket. The scheduled Worker currently expires upload tokens only; it does not delete CNIC files. These controls must not be bypassed manually or described as a completed deletion process.

Until a reviewed replacement is deployed:
- Keep existing evidence private and access-restricted.
- Continue recording customer requests and escalating them to the owner.
- Do not tell a customer that their CNIC has been deleted unless the owner verifies the actual object and every controlled copy is gone.
- Do not upload untracked encrypted CNIC backups. If a backup is created for a documented recovery need, record its custodian and location, restrict access, and track its required destruction.
- Do not alter the R2 lock or database triggers without a migration, isolated restore rehearsal, failure/retry tests, backup-expiry plan and production verification.

## 8. Incident response

If a CNIC image is exposed, downloaded by an unauthorised person, sent to the wrong recipient, or stored on an unmanaged device:
- Notify the owner immediately.
- Restrict/revoke the affected account or access path.
- Preserve relevant access logs and investigate which records were affected.
- Rotate relevant credentials/tokens if compromise is possible.
- Do not delete audit evidence or conceal the incident.
- The owner should assess customer communications and any applicable reporting/legal obligations.

## 9. Staff acknowledgement

Each authorised staff member must confirm that they understand the purpose limitation, access rules, no-copy rule, retention policy and incident process. Keep the acknowledgement with the staff record, not in GitHub.

Staff name: ____________________  
Role: _________________________  
Individual account ID: __________  
Acknowledgement date: __________  
Owner/manager authorisation: _____
