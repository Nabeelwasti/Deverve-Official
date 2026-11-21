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
