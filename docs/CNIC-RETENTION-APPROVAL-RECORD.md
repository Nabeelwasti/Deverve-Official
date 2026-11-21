# De VERVE — CNIC collection and retention approval record

**Status: DRAFT — NOT APPROVED.** This document is a decision record for the business owner and Pakistan-qualified counsel. It is not legal advice, proof of consent, or evidence that any approval has been obtained.

## 1. System and data scope

- Business: De VERVE
- System: De VERVE website / rental management
- Data: CNIC image or copy, document metadata, rental reference, upload/view/download audit events
- Current storage: private Cloudflare R2 object storage; related metadata and authorization records in Cloudflare D1
- Current technical posture: private object access, role checks, audit events, immutable evidence safeguards and indefinite-retention lock for the protected rental-evidence prefix.
- Current policy state: the project records an owner instruction for indefinite retention. That instruction has not been established here as a legal requirement or approved legal basis.

## 2. Owner decision — complete every field

**Do not tick or sign a choice until the owner has read the linked privacy notice, rental agreement and counsel's advice.**

- [ ] Confirm the business entity/person legally responsible for rental operations and the data controller decision.
- [ ] Confirm the precise purpose(s) for collecting a CNIC copy. Explain why checking the original or recording a limited verification result is insufficient, if a full copy is proposed.
- [ ] Confirm whether CNIC collection is mandatory for every rental, only specified vehicle/rental types, or only where a documented risk criterion applies.
- [ ] Approve the customer-facing notice and explicit consent wording before upload.
- [ ] Approve the smallest staff roles that can view or download evidence; name the custodians and backup custodians.
- [ ] Approve the access-log review frequency and incident/escalation owner.
- [ ] Select a retention rule only after counsel reviews it:
  - [ ] Delete after a defined period from rental closure: ______ days/months/years.
  - [ ] Retain only while a documented claim, dispute, investigation, or legal hold remains open, then delete under an approved schedule.
  - [ ] Retain for another specifically justified period: ____________________.
  - [ ] Continue indefinite retention only if counsel documents a defensible legal basis, necessity, proportionality, notice/consent approach, review interval, and treatment of deletion requests.
- [ ] Approve a periodic review date and responsible role: ____________________.
- [ ] Approve the exception and legal-hold process, including who can impose/release a hold and how the decision is logged.
- [ ] Approve the response process for access, correction, objection, deletion and complaint requests, subject to counsel's advice and any lawful retention duty.

Owner name and title: ______________________________

Signature: ________________________________________

Date (Pakistan local time): _________________________

Decision / conditions: ______________________________

## 3. Pakistan-qualified legal review — required before treating indefinite retention as approved

Counsel should review the law and facts in force on the date of advice, including at minimum:

1. Whether the CNIC image/copy is necessary for this specific vehicle-rental model and whether less intrusive verification can meet the same objective.
2. Applicable requirements under the Prevention of Electronic Crimes Act, 2016 as amended, including section 16 on unauthorized obtaining, selling, possession, transmission or use of identity information, and any applicable confidentiality obligations.
3. The status and applicability of any enacted personal-data legislation, rules, provincial laws, sector-specific requirements, court orders or contractual duties. Do not treat a draft bill as enacted law.
4. The legal basis for collection and retention, adequacy of customer notice and consent, purpose limitation, data minimization, retention/deletion schedule, access controls, disclosure limits and cross-border/cloud processing.
5. Whether storing an entire CNIC image is necessary, whether masking/redaction is appropriate, and whether a verification record can replace the image after the relevant check.
6. The effect of claims, accidents, disputes, chargebacks, investigations, limitation periods, litigation holds and contractual obligations on retention.
7. Required customer-facing wording, complaint handling, access/correction/deletion responses and breach/incident procedure.
8. Whether Cloudflare's hosting/storage locations and any off-site backup provider create cross-border transfer or contractual issues that need specific controls.
9. Whether the current indefinite R2 lock and database immutability triggers should remain, be narrowed, or be replaced with a legally reviewed retention/hold mechanism. Any change must be separately engineered and tested.

Counsel / law firm: _________________________________

Pakistan Bar Council / relevant Bar enrolment details (if supplied): _________________________________

Advice date: ______________________________________

Written advice / matter reference (store securely, do not commit privileged advice): _________________________________

- [ ] Counsel reviewed the actual data flow, customer notice, rental agreement and technical retention controls.
- [ ] Counsel gave a written view on the chosen retention period and exceptions.
- [ ] Counsel reviewed cloud hosting, backup and access arrangements.
- [ ] Counsel approved or required revisions to customer-facing documents.
- [ ] Counsel confirmed the operational steps required before launch.

Counsel name and signature: _________________________

## 4. Interim controls while approval is pending

- Keep CNIC objects private and available only to specifically authorized rental staff.
- Do not use CNIC images in AI prompts, marketing, analytics, general email, WhatsApp, public links or GitHub.
- Do not collect new CNIC copies unless the current rental workflow has a documented purpose, customer notice/consent and owner-authorized operational need.
- Do not weaken existing evidence locks or immutability triggers, and do not promise indefinite retention as a legal requirement.
- Do not delete or overwrite existing evidence as a routine cleanup. Preserve it while counsel determines the lawful retention and hold approach.
- Restrict production access to named staff, review access logs, and record any disclosure or incident.
- If a customer requests deletion or objects, preserve the request and refer it to the designated owner/counsel decision-maker; do not automatically refuse or automatically destroy evidence.
- Review this interim status every 90 days until a signed decision is recorded.

## 5. Technical change control after approval

Any change to collection scope, consent, retention period, object-lock settings, database triggers, evidence backup, staff roles or customer notices requires:

1. A reviewed implementation plan mapped to the signed decision.
2. A tested migration and isolated R2/D1 restore rehearsal.
3. A documented rollback plan that does not destroy existing evidence.
4. Updated customer-facing notice and staff runbook.
5. Production verification and an audit record of the change.

**Approval status remains pending until both the owner decision and written legal review are complete.**
