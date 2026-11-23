import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const app = read("src/App.tsx");
const admin = read("src/Admin.tsx");
const worker = read("worker/index.ts");
const styles = read("src/styles.css");
const brandLogo = read("src/BrandLogo.tsx");
const brandHead = read("src/BrandHead.tsx");
const account = read("src/CustomerAccount.tsx");
const chat = read("src/AIChatWidget.tsx");

test("all customer-facing brand marks use the one owner-managed logo component and endpoint", () => {
  assert.match(brandLogo, /"\/api\/brand\/logo"/);
  assert.match(brandHead, /\/api\/brand\/logo/);
  assert.match(account, /import BrandLogo from "\.\/BrandLogo"/);
  assert.match(account, /<BrandLogo className="customer-brand-logo"\/>/);
  assert.doesNotMatch(account, /<span>DV<\/span>/);
  assert.match(app, /<BrandLogo className="brand-logo-image" \/>/);
  assert.match(app, /<BrandLogo className="footer-brand-logo"\/>/);
  assert.match(chat, /<BrandLogo className="ai-chat-brand-logo" \/>/);
  assert.match(worker, /publicPath==="\/api\/brand\/logo"/);
});

test("round logo frames do not add a second white border or inset padding", () => {
  assert.match(styles, /\.deverve-round-logo\{[^}]*object-fit:var\(--dv-brand-logo-fit,cover\)[^}]*border:0[^}]*background:transparent[^}]*padding:0/);
  assert.match(styles, /\.brand-logo-image\.deverve-round-logo\{[^}]*object-fit:var\(--dv-brand-logo-fit,cover\)!important[^}]*border:0!important[^}]*background:transparent!important[^}]*padding:0!important/);
  assert.match(styles, /\.ai-chat-head \.ai-chat-brand-logo\{[^}]*object-fit:var\(--dv-brand-logo-fit,cover\)!important[^}]*border:0!important[^}]*background:transparent!important[^}]*padding:0!important/);
});

test("PWA icons use the selected brand logo instead of legacy E placeholder SVGs", () => {
  assert.match(worker, /let logoUrl="\/api\/brand\/logo\?v=default"/);
  assert.match(worker, /\{src:logoUrl,sizes:"192x192"/);
  assert.match(worker, /\{src:logoUrl,sizes:"512x512"/);
  assert.doesNotMatch(worker.slice(worker.indexOf("async function pwaManifestRoute"), worker.indexOf("async function pwaManifestRoute") + 3500), /icon-192\.svg|icon-512\.svg/);
  for (const path of ["public/icons/icon-192.svg", "public/icons/icon-512.svg", "public/icons/icon-maskable.svg"]) {
    assert.match(read(path), /href="\/api\/brand\/logo"/, path + " must use the canonical logo endpoint");
  }
  assert.match(read("public/sw.js"), /de-verve-shell-v4/);
  assert.match(read("public/manifest.webmanifest"), /"src": "\/api\/brand\/logo"/);
  const pagesManifest = read("functions/manifest.webmanifest.ts");
  assert.match(pagesManifest, /logo_id/);
  assert.match(pagesManifest, /\/api\/brand\/logo/);
  assert.doesNotMatch(pagesManifest, /favicon_id|de-verve-loader\.svg|icon-192\.svg/);
  assert.match(brandHead, /&v=2/);
  assert.doesNotMatch(brandHead, /favicon_id|de-verve-loader\.svg/);
});

test("social profile saving is isolated, verified, and visibly reported", () => {
  const start = admin.indexOf("const saveSocialLinks");
  const end = admin.indexOf("const uploadBrandAsset", start);
  assert.ok(start >= 0 && end > start, "social save handler exists");
  const handler = admin.slice(start, end);
  assert.match(handler, /JSON\.stringify\(\{social_links:normalized\}\)/);
  assert.doesNotMatch(handler, /brand_assets|category_assets|notification_emails|payment_methods/);
  assert.match(handler, /\/api\/storefront\/settings/);
  assert.match(handler, /setSocialMessage\(\{kind:"success"/);
  assert.match(admin, /admin-social-feedback/);
  assert.match(app, /footer-social-links/);
  assert.match(app, /contact-social-links/);
});

test("every admin artwork slot has a live rendering target and editable frame controls", () => {
  const sectionSlots = ["hero","feature_fashion","feature_account","feature_wholesale","feature_mobility","wholesale","mobility","testimonials","footer"];
  const categorySlots = ["category_men","category_women","category_kids","category_essentials","category_layers","category_bottoms"];
  for (const key of sectionSlots) {
    assert.ok(admin.includes('id:"' + key + '"'), "admin exposes " + key);
    assert.ok(worker.includes('"' + key + '"'), "Worker accepts " + key);
    assert.ok(app.includes("section_images." + key), "storefront renders " + key);
    assert.ok(styles.includes("--dv-section-" + key + "-size"), "CSS consumes " + key + " fit");
    assert.ok(styles.includes("--dv-section-" + key + "-position"), "CSS consumes " + key + " focal point");
  }
  for (const key of categorySlots) {
    assert.ok(admin.includes('id:"' + key + '"'), "admin exposes " + key);
    assert.ok(worker.includes('"' + key + '"'), "Worker accepts " + key);
  }
  assert.ok(admin.includes('id:"brand_logo"'), "admin exposes the shared logo frame");
  assert.ok(worker.includes('"brand_logo"'), "Worker accepts the shared logo frame");
  assert.match(app, /--dv-brand-logo-fit/);
  assert.match(styles, /--dv-brand-logo-fit/);
  assert.match(styles, /--dv-brand-logo-position/);
  assert.match(admin, /Horizontal focus/);
  assert.match(admin, /Vertical focus/);
  assert.match(admin, /Fill frame \(cover\)/);
  assert.match(admin, /Show full image \(contain\)/);
  assert.match(app, /category_"\+item\.id/);
  assert.match(worker, /Image focus values must be whole percentages from 0 to 100/);
});

test("outlet map lookup searches the De VERVE business name, not only the street address", () => {
  assert.match(app, /maps\/search\/\?api=1&query=De\+VERVE\+Jhelum\+Pakistan/);
});
