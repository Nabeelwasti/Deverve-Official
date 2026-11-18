# De VERVE external sign-in and free-service integration plan

**Date:** 18 November 2026  
**Status:** Architecture and implementation gates recorded; provider login is not enabled yet.

## Scope

Add customer-facing **Continue with Google** and **Continue with Microsoft** options while preserving the existing De VERVE account system and Worker-issued secure sessions. Evaluate optional no-cost AI and productivity services without making the website dependent on fragile free quotas.

This document is not evidence that provider login is already implemented. No provider credentials have been supplied or configured, and no new login button should be shown as functional until end-to-end provider verification tests pass.

## Existing identity architecture

The current application already has D1-backed customer accounts with email/password registration and login, D1-backed customer sessions and logout/revocation, Worker-protected admin login, bootstrap, staff roles and owner-only operations, plus rate limiting and security checks on account operations.

Provider sign-in must exchange a verified provider identity for a De VERVE session. It must not replace the Worker as the authorization authority.

## Customer Google sign-in

Use Google's current **Google Identity Services (GIS)** web integration, not the deprecated legacy Google Sign-In library.

- Obtain a Google OAuth 2.0 Web Client ID and configure authorized JavaScript origins and redirect URIs for the exact production hostname(s).
- Request identity-only scopes (openid, email, profile) for login. Do not request Drive scopes during sign-in.
- Send the resulting ID token to a same-origin Worker endpoint over HTTPS.
- The Worker must validate the JWT signature against Google's published JWKS, issuer, audience (the configured client ID), expiry, issued-at, nonce, and verified-email claim. Do not trust client-provided name/email/subject fields.
- Resolve an existing linked provider subject first. If no link exists, allow account creation only when the email is verified and the account-linking policy permits it.
- Never silently merge an existing password account solely because the email strings match. Require the user to authenticate to the existing account or complete a secure verified-email linking flow.
- Issue the normal De VERVE HttpOnly, Secure, SameSite session cookie only after successful validation. Store only the provider subject/issuer mapping and minimal profile fields needed by the business; do not store provider access tokens when not required.

Official setup: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid  
Official GIS JavaScript reference: https://developers.google.com/identity/gsi/web/reference/js-reference

## Customer Microsoft sign-in

Use the Microsoft identity platform with a supported MSAL library and OpenID Connect.

- Register a Web or SPA application according to the final callback architecture.
- Select supported account types deliberately. The recommended customer-facing choice is personal Microsoft accounts plus organizational accounts, unless the owner decides to restrict it.
- Use authorization code flow with PKCE and OIDC. Validate state and nonce; do not hand-roll a raw OAuth flow when MSAL can manage it.
- The Worker must validate the ID token signature using Microsoft's discovery/JWKS metadata, issuer, audience, expiry, nonce and tenant/account policy.
- Use stable issuer + subject/object identifiers for the provider link. Do not assume email or preferred_username is always present, stable, or verified.
- Do not automatically merge an existing customer account based only on a matching email address.
- Issue the same De VERVE HttpOnly, Secure, SameSite session cookie after validation.

Official documentation:
- https://learn.microsoft.com/en-us/entra/identity-platform/
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc

## Admin and staff access rules — mandatory

Google or Microsoft sign-in is not an administrator invitation.

- Public customer OAuth registration must never create an admin record.
- Admin access remains limited to pre-existing, active D1 admin accounts and their existing roles.
- Link an identity provider to an admin account only after the user authenticates with the existing account and the owner approves the link.
- Never grant owner role based on an email domain, a Google/Microsoft account type, a client-side claim, or first sign-in.
- Preserve owner/manager/catalogue/orders/rental/viewer permission checks in the Worker.
- Require fresh authentication or additional approval for high-risk changes such as staff role changes, finance, CNIC access/export, payment settings, and backup recovery.
- Log provider linking/unlinking, login failures, role changes, session revocations and high-risk actions without logging ID tokens or secrets.
- Support owner-initiated session revocation and provider unlink only when another secure recovery method remains available.

## Provider identity data model

Before enabling either provider, add a reviewed additive D1 migration for an external identity link table with:
- random internal link ID;
- customer/admin subject type and corresponding internal account ID;
- normalized provider identifier (google or microsoft);
- immutable provider issuer and subject identifier;
- created/last-used timestamps;
- unique constraint on issuer + subject;
- unique constraint preventing duplicate provider links to the same internal account where appropriate;
- foreign-key and index design that does not allow customer deletion or account-link actions to cascade into permanent rental/CNIC evidence.

Do not place OAuth access/refresh tokens in this identity-link table. Do not alter or weaken the permanent CNIC retention tables/triggers.

## Session security

- Continue to issue De VERVE sessions from the Worker; provider tokens are only proof of the initial login.
- Use high-entropy opaque session secrets, store only their cryptographic hashes in D1, and set HttpOnly; Secure; SameSite=Lax cookies with a narrow path/domain policy.
- Rotate session identifiers after authentication and privilege changes.
- Apply CSRF/origin checks to state-changing requests and rate-limit provider exchange endpoints by IP and account.
- Validate JWT signature and claims server-side. A decoded JWT is not a verified JWT.
- Avoid localStorage for session tokens. Never log authorization codes, ID tokens, access tokens, client secrets or PKCE verifiers.
- Test issuer key rotation, malformed tokens, wrong audience, expired tokens, replayed nonce/state, duplicate identity, unverified email, disabled accounts, revoked sessions and cross-origin requests.

## Google Drive is a separate authorization

Google sign-in and Google Drive backup are different permissions:
- Login should request identity-only scopes.
- Drive backup should use a separate, explicit owner action and least-privilege drive.file scope.
- Do not combine Drive consent with customer login.
- Do not request Drive access from customers or staff.
- CNIC, customer PII, HR, finance and database backups must be encrypted client-side or in a trusted backend before external storage. Keep passwords/keys separate.
- The Google Drive OAuth client used for login may be kept separate from the Drive upload client to simplify consent, least privilege and credential rotation.

## AI integrations and free-tier safety

### Gemini API

Gemini API currently advertises a free tier for selected models with limited access and rate limits. The current pricing page states that free-tier content may be used to improve Google's products; paid-tier data handling differs. Model availability and quotas can change.

Use only for low-risk public content tasks such as product descriptions, social captions, public FAQs and generic drafting. Do not send CNIC images, ID numbers, customer messages, phone/email addresses, rental contracts, staff records, payment details, or private business exports to a free-tier model.

Official pricing: https://ai.google.dev/gemini-api/docs/pricing

### Microsoft AI / Foundry

Microsoft Foundry can be explored without a fee, but the individual models and services consumed have their own billing. Do not describe it as unlimited free AI. Any integration requires an explicit subscription/billing review and per-feature cost limits.

Official pricing: https://azure.microsoft.com/en-us/pricing/details/microsoft-foundry/

### AI gateway policy

- Keep AI provider keys only in Worker secrets, never in Vite VITE_* variables or browser code.
- Add an owner-controlled provider/model allowlist, usage caps, request throttling, timeouts, response-size limits and a kill switch.
- Show the current provider/model and whether it is free-tier or paid.
- Do not silently fall back from a free model to a paid model.
- Treat AI output as untrusted suggestions. Never allow an AI response to approve payments, change prices, grant roles, access CNIC files, or execute destructive actions.
- Do not submit private customer or employee data to a provider unless the owner has explicitly approved the provider's data terms and the relevant legal/privacy basis.

## Other optional integrations to evaluate

Only adopt services that solve a real business need and have clear quotas, data processing terms and exit paths:
- Google Drive: owner-authorized encrypted backups (separate from sign-in).
- Microsoft 365 / OneDrive or SharePoint: optional document collaboration; not a substitute for independent backups.
- Resend: transactional email after sender verification and owner approval.
- Cloudflare Turnstile: abuse protection for public forms.
- Gemini: low-risk public-content assistant with strict free-tier controls.
- Microsoft Graph: only specific calendar/email/document features after explicit user consent and permission review.

Do not add all integrations merely because a free tier exists. Every new provider increases credentials, attack surface, outage dependencies and data-controller responsibilities.

## Credentials and owner setup required before implementation can be activated

### Google
- Create a Web OAuth client in the business-owned Google Cloud project.
- Configure the exact production origin(s) and callback URL(s).
- Supply only the public Client ID through an approved secret/configuration channel.
- Never share a Google password, OAuth client secret, refresh token or recovery code in chat.

### Microsoft
- Register the application in Microsoft Entra.
- Select account types intentionally.
- Configure the exact production redirect URI(s).
- Supply the Application (client) ID and tenant/account policy. A client secret is not needed for a browser PKCE flow; if a confidential server-side code exchange is chosen, the secret must be stored only as a Worker secret and never shared in chat.

The exact final callback URLs must be confirmed against the production hostname before registration. The existing Cloudflare Pages preview URL must not be assumed to be the permanent custom domain.

## Release checklist

Do not enable sign-in or advertise the buttons until all of these pass:
1. Add and review the external identity migration.
2. Implement Google and Microsoft provider initiation/callback/exchange.
3. Verify JWT signatures, issuer, audience, nonce, state, expiry and provider-specific claims server-side.
4. Issue and revoke De VERVE sessions using the existing Worker session system.
5. Prove OAuth can never create or elevate admin roles.
6. Add secure account-linking and unlinking UX.
7. Add provider-specific unit and Worker integration tests.
8. Add browser tests for successful sign-in, cancelled consent, provider outage, duplicate identities, disabled accounts and sign-out.
9. Test on Android Chrome and desktop browsers.
10. Complete privacy notice, consent text, retention and support/recovery policy.
11. Configure production provider IDs/secrets only after owner approval.
12. Run the complete CI suite and real-origin production smoke test after the owner explicitly authorizes deployment.

This provider-integration plan does not authorize external account creation, provider-secret changes, customer data migration, or production data changes. Cloudflare Pages production deployments are configured to trigger automatically from normal commits to `main`; no deployment-suppression prefix is required.
