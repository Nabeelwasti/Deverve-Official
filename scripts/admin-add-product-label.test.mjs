import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("both Add product actions expose a visible text label", () => {
  const source = readFileSync(new URL("../src/Admin.tsx", import.meta.url), "utf8");
  const matches = [...source.matchAll(/className="admin-primary admin-add-product-button"[\s\S]{0,400}?<span className="admin-add-product-label">Add product<\/span>/g)];
  assert.equal(matches.length, 2, "the dashboard and product workspace must both have labelled Add product actions");
  const styles = readFileSync(new URL("../src/admin.css", import.meta.url), "utf8");
  assert.match(styles, /\.admin-add-product-button \.admin-add-product-label\{[^}]*display:inline!important[^}]*visibility:visible!important[^}]*color:#fff!important/);
});
