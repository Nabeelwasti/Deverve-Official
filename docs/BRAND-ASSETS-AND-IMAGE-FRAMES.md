# De VERVE brand assets and live image frames

## One official logo source

The owner-selected logo is stored as a ready image in the private media bucket and selected through the public `brand_assets.logo_id` setting. Customer-facing components must use the shared `BrandLogo` component, which loads `/api/brand/logo`. Do not hard-code a media ID or use a separate favicon/logo upload for the same brand mark.

The canonical endpoint is also used by:
- The first-paint loading mark and browser tab / Apple touch icon
- The customer account header, storefront header, admin header, footer and AI chat
- The Worker PWA manifest and Pages `/manifest.webmanifest` function
- Static SVG app-icon fallbacks, which embed the same canonical endpoint

The PWA manifest uses the selected square owner crop for 192px and 512px app icons. The maskable icon keeps the same logo inside the platform safe zone. After a logo replacement, the manifest URL is versioned; already-installed Android launchers may still require the user to update/reinstall the app to refresh a cached launcher bitmap.

## Website designer image-slot contract

All supported homepage artwork IDs must have three matching entries:
1. An owner-visible slot in `SiteVisualDesigner`
2. A validated Worker allowlist entry in `adminStoreSettingsRoutes`
3. A real storefront rendering target and CSS background variable

Section slots:
- `hero` → homepage `.hero-art`
- `feature_fashion`, `feature_account`, `feature_wholesale`, `feature_mobility` → the four `.trust-pillar-card` service cards
- `wholesale` → `.wholesale-art`
- `mobility` → `.mobility-section`
- `testimonials` → `.testimonials-section`
- `footer` → `.site-footer`

The `brand_logo` frame applies to the shared circular logo component across header, account, admin, footer, AI chat and loading surfaces.

Category slots use the existing `category_assets` media IDs and keys `category_men`, `category_women`, `category_kids`, `category_essentials`, `category_layers`, and `category_bottoms`.

Each frame stores only a validated `fit` value (`cover` or `contain`) and integer horizontal/vertical focal points from 0–100. These values live in `site_design.image_settings`; no schema migration is needed. The admin preview uses the matching frame ratio and the same fit/focal-point settings applied by the storefront. Category source photos continue to be uploaded/cropped in the Homepage category artwork panel.

## Social profiles

Social links are saved independently through `PATCH /api/admin/settings` with only `social_links`. They are normalized to HTTPS, then read back through `/api/storefront/settings` before the admin UI reports success. The links appear in both the footer and the contact section. Empty values hide a profile.

## Outlet map search

The public contact action searches Google Maps for the business name `De VERVE` in Jhelum rather than geocoding only the street address. This avoids reusing an address-derived pin that may point to the wrong property. The exact pin still depends on the verified De VERVE Google Maps / Business Profile listing; never hard-code unverified coordinates.
