import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("saving general admin settings never silently enables CNIC uploads", () => {
  const source = readFileSync(new URL("../src/Admin.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const saveSocialLinks");
  assert.notEqual(start, -1, "general settings save handler must exist");
  const end = source.indexOf("const uploadBrandAsset", start);
  assert.notEqual(end, -1, "general settings handler boundary must exist");
  const handler = source.slice(start, end);
  assert.doesNotMatch(handler, /cnic_uploads_enabled\s*:\s*true/, "unrelated settings saves must not turn on sensitive identity-document collection");
});

test("owner-managed category artwork is persisted and exposed without weakening CNIC settings", () => {
  const admin = readFileSync(new URL("../src/Admin.tsx", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(admin, /category_assets\s*:\s*categoryAssets/, "owner settings save must include category image IDs");
  assert.match(admin, /Homepage category artwork/, "owner settings must expose the six live category cards");
  assert.match(admin, /uploadCategoryAsset/, "category image upload workflow must exist");
  assert.match(worker, /const allowed=new Set\(\["men","women","kids","essentials","layers","bottoms"\]\)/, "only the six supported category keys may be written");
  assert.match(worker, /website\.category_assets_updated/, "category image changes must be audited");
  assert.match(worker, /setting_key IN \('social_links','brand_assets','category_assets','site_design'\)/, "public storefront settings must include category images and owner design tokens");
  assert.match(admin, /Website visual design studio/, "owner must have a live website visual design workspace");
  assert.match(worker, /website\.site_design_updated/, "global website design changes must be audited");
  assert.match(worker, /const allowedImages=new Set\(\["hero","feature_fashion","feature_account","feature_wholesale","feature_mobility","wholesale","mobility","testimonials","footer"\]\)/, "only supported homepage artwork slots may be saved");
});
