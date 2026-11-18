# De VERVE backend and identity platform decision

**Decision date:** 18 November 2026  
**Status:** Adopted for the current release; reassess only through a reviewed migration plan.

## Decision

Keep the existing Cloudflare architecture as the production system of record for this release:

- Cloudflare Pages for the static web application.
- Cloudflare Worker for trusted server-side API operations and authorization.
- Cloudflare D1 for transactional business records.
- Private Cloudflare R2 for private rental/CNIC evidence and other protected media.

Do not add Supabase or Firebase as a second production database or authentication authority during the current hardening work. Do not migrate, duplicate, or split customer, rental, inventory, finance, order, staff, or CNIC records across providers without a separately approved migration and restore plan.

This is a risk-control decision, not a claim that Supabase or Firebase are unsuitable products.

## Why not introduce another backend now?

The current application already has a Worker API, D1 schema, R2 object handling, custom admin authentication, authorization checks, rate limits, and permanent CNIC evidence safeguards. Adding another backend now would create two identity systems, additional secrets, more network failure modes, duplicate data, and new backup/restore obligations before the existing release blockers are closed.

A second database would also require reliable synchronization, conflict handling, audit history, data ownership rules, and a tested recovery path. A simple SDK installation would not solve those business requirements.

## Supabase assessment

Supabase is the stronger candidate if a future platform migration is approved because PostgreSQL is a natural fit for relational business records, reporting, joins, and transactional workflows. Its Auth, Storage, Realtime, and Row Level Security can reduce custom infrastructure work.

The current published Free plan includes, among other limits, 500 MB database storage per project, 1 GB file storage, 5 GB egress, and 50,000 monthly active users for Auth. Free projects can pause after one week of inactivity. Automatic database backups and point-in-time recovery are not included in Free. Supabase also states that database backups do not include Storage object bytes. These limits make the Free plan useful for evaluation, but not a complete production backup or high-availability strategy.

Official references:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/auth

## Firebase assessment

Firebase Authentication can provide managed sign-in methods and a ready-made FirebaseUI flow. It still requires the business to configure sign-in providers and the app to implement or integrate the sign-in flow. It does not mean that administrators can access protected business data without authentication.

Firebase can persist a signed-in session on the same browser/device, which may reduce repeated sign-ins. That behavior must be balanced against the risk of shared devices and sensitive admin data. Authorization still needs explicit role checks and restrictive Security Rules or trusted backend checks. Anonymous authentication is not a replacement for a permanent, verified staff identity.

The Spark plan has product-specific quotas and restrictions. Moving to a paid or Identity Platform configuration can change limits and billing. Cloud Storage access, database rules, billing requirements, and export/restore behavior must be reviewed independently before any adoption.

Official references:
- https://firebase.google.com/docs/auth
- https://firebase.google.com/docs/auth/web/auth-state-persistence
- https://firebase.google.com/docs/rules/rules-and-auth
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

## Authentication clarification

Managed authentication can remove the need for us to build password verification, reset flows, provider integrations, and session lifecycle from scratch. It does not remove authentication itself.

For De VERVE:
- Public customers may browse public products and submit permitted enquiries without an admin account.
- Staff/admin workspaces must require an authenticated identity.
- Roles and permissions must be assigned by a trusted owner/admin process, not inferred from a user's email address or client-side state.
- Sensitive actions such as viewing CNIC evidence, changing rental records, financial operations, exporting data, and managing staff require server-side authorization and audit logging.
- Persistent sessions should be short enough for the risk level, revocable, protected by secure cookies/tokens, and re-authenticated for high-risk actions where appropriate.
- A "remember me" option must never silently bypass authorization or expose a shared device to the next user.

## Future evaluation path

After current production blockers are closed, evaluate Supabase in an isolated non-production proof of concept. Do not connect it to live customer or CNIC data. The proof of concept must demonstrate:

1. Email/password and Google sign-in with verified identities and account recovery.
2. Server-side role/permission enforcement and denial tests for unauthorized users.
3. Secure session persistence, expiry, revocation, and shared-device behavior.
4. A relational model for products, inventory, customers, orders, rentals, payments, and audit events.
5. Private object storage access controls and signed access with short expiry.
6. Complete database plus object-storage backup and a successful restore drill.
7. Data export and a tested exit/migration path.
8. A documented monthly cost model beyond free quotas, including email, storage, bandwidth, backups, and support.

Only choose Supabase if the measured benefits justify the operational migration. Firebase should be reconsidered if a strong real-time/mobile requirement emerges that outweighs the relational reporting advantages.

## Current release blockers remain separate

This decision does not complete or replace:
- Google Drive website OAuth, encrypted uploads, and verified restore.
- Full business-wide D1 + private R2 + media backup and restore.
- A verified real-origin production smoke test and owner-approved business acceptance after the next normal GitHub-triggered release.
- CNIC recovery into a replacement environment; the current CNIC restore tool downloads and verifies files but does not reinsert them into D1/R2.
- A full owner-approved production restore drill.

This document does not authorize production data changes, database migrations, external provider setup, or deletion. Cloudflare Pages production deployments are now automatically triggered by normal commits to `main`; do not add a deployment-suppression prefix.
