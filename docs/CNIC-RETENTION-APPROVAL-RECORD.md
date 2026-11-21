# De VERVE — CNIC collection, access, retention and deletion decision record

**Status: OWNER POLICY RECORDED — LEGAL REVIEW AND FORMAL SIGNATURE PENDING.** This record captures the rental-CNIC policy expressly confirmed by the business owner in the project conversation. It is not a lawyer's opinion, a signed contract, or proof that customer notices/consents have been deployed. Do not represent the legal review as complete.

## 1. System and data scope

- Business: De VERVE
- System: De VERVE website / rental management
- Data: CNIC images (front and back), identity/document metadata, rental reference, verification outcome, customer requests, access/view/download audit events and deletion/hold records.
- Current storage: private Cloudflare R2 object storage; related metadata and authorization records in Cloudflare D1.
- CNIC images are high-risk identity documents. They must never be placed in public buckets, public URLs, source control, logs, analytics, AI prompts, marketing materials, general email or unapproved messaging channels.

## 2. Owner-confirmed rental-CNIC policy

The following operational policy was expressly confirmed by the owner:

### 2.1 Collection and purposes

- A customer requesting any vehicle rental must submit clear images of both sides of their CNIC for review before the rental request can be approved.
- Purposes: verify the applicant's identity and match it to the rental request; support rental approval; prevent identity misuse and fraud; protect De VERVE's premium, luxury and high-value vehicles; and support legitimate rental-history and incident verification.
- CNIC evidence is for rental/security purposes only. It must not be repurposed for marketing, profiling unrelated to rentals, public disclosure or unrelated business activity.
- The customer must be shown a clear notice before upload describing the required documents, purposes, who can access them, retention rule, security contact and how to request access/correction/deletion. The site must record the notice version and the customer's affirmative acknowledgement with timestamp and rental reference. Counsel must approve the final wording and collection flow.

### 2.2 Access

- Only the business owner and specifically authorized, relevant rental manager/staff may view CNIC images.
- Access must be role-based, least-privilege, individually attributable and revocable. Shared staff accounts are not acceptable for evidence access.
- Every view, download, replacement, decision, export and deletion must be auditable with actor, timestamp, rental reference, action and outcome. Never log the CNIC image bytes or full CNIC number.
- Staff must not copy CNIC images to personal phones, local galleries, USB drives, personal cloud accounts, messaging apps or unapproved devices. Any unavoidable operational exception requires prior owner authorization and a documented secure process.

### 2.3 Retention and deletion clock

- The owner-selected retention rule is **90 days after successful clearance of all amounts and obligations relating to the rental**.
- The 90-day clock starts only when an authorized staff member records that all rental payments, damages, charges, challans (if any), penalties and other applicable fees have been fully settled and reconciled. Vehicle return alone, booking completion, or partial payment does not start the clock.
- If any amount, damage assessment, challan, dispute, claim, investigation or other relevant obligation remains unresolved, the clearance event must not be recorded and the deletion clock must not start.
- When the 90-day period expires, CNIC images should enter the approved deletion workflow and be securely deleted from primary storage and managed copies/backups according to the technically verified backup-expiry schedule, unless a documented lawful hold or other counsel-confirmed legal requirement applies.
- A legal hold must identify its reason, authorizing owner/manager, scope, start date, review date and release decision. Holds must be reviewed periodically and lifted promptly when no longer justified.
- Do not silently extend retention, reset the 90-day clock or preserve copies in unmanaged backups.

### 2.4 Customer deletion requests

- Customers may submit a request to delete their CNIC and related personal data.
- Staff must acknowledge, identity-check and register the request, link it to the relevant rental(s), record the date and preserve a complete decision trail.
- Relevant staff review the request and recommend an outcome. Only the owner or a specifically authorized manager may approve or reject it, with reasons recorded.
- Approval is not an instruction to destroy evidence immediately if the owner's 90-day retention rule has not yet expired or if a documented legal hold applies. The request must be assessed against the retention schedule and counsel-approved exceptions; if deletion is deferred or refused, communicate the reason and review date to the customer.
- Once deletion is authorized, delete the CNIC image and unnecessary copies, invalidate access paths, record completion, and ensure backup copies expire or are purged under the documented backup schedule. Retain only a minimal deletion/audit record that does not reproduce the CNIC image or full CNIC number, where lawful.
- Never automatically reject a request or automatically destroy evidence without the required review and decision.

## 3. Pakistan legal and regulatory research — preliminary, not legal sign-off

Research checked on 21 November 2026:

1. **PECA 2016, section 16:** unauthorized obtaining, selling, possessing, transmitting or using another person's identity information is punishable. The section also provides a mechanism for a person whose identity information is affected to apply for securing, destroying, blocking access to or preventing transmission of that information. The CNIC workflow therefore needs clear authorization, purpose, customer notice, access controls and careful disclosure handling. See the Pakistan Code-linked text at https://statutes.pk/peca/16 and verify the official consolidated Act/Gazette before relying on it.
2. **PECA 2016, section 41:** addresses certain harmful or wrongful disclosures of personal-information material obtained by a person/service provider/authorized officer. Staff access and disclosures must be tightly controlled. See https://statutes.pk/peca/41 and verify the official consolidated Act/Gazette.
3. **PECA Amendment Act 2025:** PECA was amended in 2025. The current consolidated text, amendments, rules and any later notifications must be checked by counsel, not inferred from an older copy. The NCCIA official laws page lists PECA 2016 and the 2025 Amendment Act: https://www.nccia.gov.pk/laws.php.
4. **Dedicated data-protection legislation:** the Ministry of IT's legislation listing identifies the Personal Data Protection Bill May 2023 as a draft. The Senate's official bill register says the Personal Data Protection Bill, 2023 was neither passed nor rejected by the committee and consequently stands withdrawn from the committee/disposed of. The National Assembly's current list of Bills Passed by Parliament does not list a Personal Data Protection Act. DLA Piper's Pakistan guide, last modified 17 March 2026, also reports no enacted comprehensive standalone data-protection statute at that date. A National Assembly document surfaced in research referring to a government-finalized data-protection bill/Act 2026, but it is not an Act or Gazette notification; do not treat that policy/briefing language as enacted law. Re-check the Gazette, Parliament and Ministry listings on the date counsel signs. Sources: https://www.moitt.gov.pk/Legislations ; https://www.senate.gov.pk/en/pbs.php?catid=1&cattitle=Bills&leftcatid=278&subcatid=276 ; https://www.na.gov.pk/en/bills.php?status=majlis ; https://www.dlapiperdataprotection.com/?c=PK&t=transfer.
5. **Constitutional privacy and other law:** counsel must assess Article 14 of the Constitution, applicable contract, evidence, criminal, consumer, provincial and sector-specific rules, limitation periods, lawful requests/orders and any other current legal duties relevant to the actual rental model.
6. **Cloud and cross-border processing:** counsel must review Cloudflare R2/D1 processing locations, subprocessors, contractual terms, support access, backup destinations and any cross-border transfer implications. Do not assume that choosing a region or using a private bucket resolves every legal issue.

### Preliminary risk assessment

The stated business purpose—identity matching, fraud prevention and protection of expensive rental vehicles—is commercially understandable. However, requiring and retaining full front-and-back CNIC copies for every applicant is more intrusive than checking an original and recording a verification result. The legal necessity and proportionality of collecting a full copy from every applicant, rather than applying a risk-based or less-intrusive alternative, must be tested by Pakistan-qualified counsel. The owner's 90-day post-clearance rule is a defined business policy, not proof that this precise period is legally required or automatically lawful in every case. Likewise, a customer deletion request does not itself establish that immediate deletion is required or that indefinite retention is permitted.

This is a preliminary compliance assessment, not a legal opinion. No AI assistant, online research service or non-lawyer can sign a Pakistani legal opinion or guarantee that the policy is legally safe.

## 4. Required Pakistan-qualified counsel review

Before describing the CNIC policy as legally approved, counsel should review the actual website flow, rental agreement, privacy notice, staff practices and technical storage/backup configuration and provide written advice on:

1. Whether a full front-and-back CNIC copy is necessary for every rental request, and whether less intrusive identity checks or partial masking can achieve the same purpose.
2. The legal basis and adequacy of customer notice/affirmative acknowledgement for collection, verification, storage, access, retention and disclosures.
3. The 90-day post-clearance retention rule, including unresolved challans, damage claims, disputes, chargebacks, accidents, investigations, limitation periods and legal holds.
4. Customer access, correction, objection and deletion requests, including response deadlines, permitted exceptions, reasons for deferral/refusal and appeal/escalation.
5. PECA 2016 as amended in 2025, current rules/notifications, constitutional privacy, applicable provincial and other laws, and the current legislative status of any personal-data bill.
6. Cloudflare and backup provider terms, processing locations, subprocessors, cross-border access/transfers and breach/incident obligations.
7. Staff confidentiality undertakings, role permissions, evidence handling, retention/deletion proof and customer-facing rental contract clauses.

Counsel / law firm: _________________________________

Bar enrolment / jurisdiction: ________________________

Written advice date and secure matter reference: _________________________________

- [ ] Counsel reviewed the actual end-to-end CNIC data flow and both-sided image requirement.
- [ ] Counsel reviewed and approved the customer notice, affirmative acknowledgement and rental agreement.
- [ ] Counsel reviewed the 90-day retention clock, deletion requests and legal-hold exceptions.
- [ ] Counsel reviewed cloud hosting, backups, staff access and incident response.
- [ ] Counsel issued written advice and required actions have been implemented and tested.

Counsel name and signature: _________________________

## 5. Owner formal acknowledgement

This section records the policy the owner confirmed in the project conversation. A formal business signature should still be obtained and stored in the business's controlled records.

Owner name and title: ______________________________

Business legal name / registration (if applicable): ______________________________

Signature: ________________________________________

Date (Pakistan local time): _________________________

- [x] Owner policy received in writing through the project conversation: front-and-back CNIC required for rental requests; identity/rental verification and fraud/security purposes; owner and relevant authorized staff access only; deletion after 90 days from full financial/incident clearance; customer deletion requests reviewed by staff and decided by owner/authorized manager.
- [ ] Formal owner signature and date obtained.
- [ ] Authorized managers/staff individually named and access approved.
- [ ] Final customer notice and rental agreement approved.

## 6. Interim security controls

- Keep CNIC objects private; enforce server-side role authorization on every read/download. Hiding a button in the UI is not access control.
- Use short-lived access links or authenticated streaming; do not expose permanent public object URLs.
- Require MFA for privileged accounts where supported, strong unique credentials, session expiry and prompt access revocation.
- Encrypt in transit and at rest; protect secrets; prevent CNIC values/images from entering logs, analytics, error reports, AI services or third-party messaging.
- Record immutable or tamper-evident access and decision events without duplicating the CNIC content.
- Apply upload type/size validation, malware scanning where available, private quarantine and safe image processing. Do not trust file extensions or browser-provided MIME types alone.
- Do not let general administrators, marketing staff, sales staff or unrelated employees view CNICs by default.
- Do not delete existing evidence or weaken existing R2 locks/triggers until the current implementation, backup copies and counsel-approved hold/retention process have been reviewed.
- Do not claim that deletion from the primary bucket also deletes every backup. Document and test actual backup expiry/purge.
- Establish a breach response process: restrict access, preserve relevant audit evidence, investigate scope, rotate credentials/tokens where needed, notify owner/counsel promptly and follow legally required notifications.

## 7. Technical change control and acceptance

The policy above is not proof that the website currently implements every requirement. Before marking this workflow production-accepted, verify:

1. Customer notice version and affirmative acknowledgement are stored with each rental request.
2. Front and back images are both required, validated, private and bound to the correct customer/rental.
3. Only the owner and individually authorized rental roles can view/download; unauthorized API requests return denial.
4. Access, review, approval, clearance, deletion-request and deletion events are audited.
5. Clearance requires explicit reconciliation of every payment, damage, charge, challan and fee; the 90-day clock starts once and cannot be reset by ordinary edits.
6. Deletion becomes due only after 90 days from recorded full clearance, unless counsel-approved rules specify a lawful exception.
7. Deletion requests have a staff review and owner/authorized-manager decision workflow, with reasons, customer communication and legal-hold checks.
8. Primary storage, replicas, backups, caches, temporary files and exports have a tested deletion/expiry process.
9. A legal hold suspends deletion only for a documented scope and is periodically reviewed.
10. Automated tests cover permission denial, cross-rental access prevention, missing-side uploads, clock boundaries, unresolved charges, deletion-request decisions, holds, retries and audit completeness.
11. Production deployment, real customer-origin HTTP/API tests, backup restoration and physical-device acceptance are separately verified.

Any implementation change must include a reviewed plan, migration/rollback, isolated restore test, regression tests, production verification and updated staff/customer documentation. Never use real customer CNICs in test fixtures.

**Final status: OWNER POLICY CAPTURED; FORMAL OWNER SIGNATURE, PAKISTAN-QUALIFIED LEGAL OPINION, TECHNICAL ACCEPTANCE AND PRODUCTION EVIDENCE REMAIN PENDING.**
