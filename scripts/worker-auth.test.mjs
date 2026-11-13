import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../.test-dist/worker/index.js";

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\\s+/g, " ").trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    const q = this.sql;
    const v = this.values;
    if (q.startsWith("SELECT s.id, s.admin_user_id")) {
      const session = [...this.db.sessions.values()].find((item) => item.token_hash === v[0] && !item.revoked_at && item.expires_at > v[1]);
      const admin = session && this.db.admins.get(session.admin_user_id);
      return admin?.is_active ? { id: session.id, admin_user_id: admin.id, email: admin.email, role: admin.role, is_active: admin.is_active, expires_at: session.expires_at, revoked_at: session.revoked_at } : null;
    }
    if (q.startsWith("SELECT id, email, role, is_active, password_hash FROM admin_users")) {
      return [...this.db.admins.values()].find((item) => item.email.toLowerCase() === String(v[0]).toLowerCase()) ?? null;
    }
    if (q.startsWith("SELECT failure_count, locked_until")) return this.db.attempts.get(v[0]) ?? null;
    if (q.startsWith("SELECT locked_until")) return this.db.attempts.get(v[0]) ?? null;
    if (q.startsWith("SELECT 1 AS ok")) return { ok: 1 };
    throw new Error("Unexpected first query: " + q);
  }
  async run() {
    const q = this.sql;
    const v = this.values;
    if (q.startsWith("INSERT INTO admin_users")) {
      if (this.db.admins.size) return { success: true, meta: { changes: 0 } };
      const row = { id: v[0], email: v[1], password_hash: v[2], role: "owner", is_active: 1, last_login_at: null };
      this.db.admins.set(row.id, row);
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO admin_sessions")) {
      this.db.sessions.set(v[0], { id: v[0], admin_user_id: v[1], token_hash: v[2], expires_at: v[3], revoked_at: null });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO admin_login_attempts")) {
      const [key, now] = v;
      const existing = this.db.attempts.get(key);
      const windowExpired = existing && Date.parse(existing.window_started_at) <= Date.parse(now) - 15 * 60 * 1000;
      const count = windowExpired ? 1 : (existing?.failure_count ?? 0) + 1;
      this.db.attempts.set(key, {
        failure_count: count,
        window_started_at: windowExpired || !existing ? now : existing.window_started_at,
        locked_until: count >= 5 ? new Date(Date.parse(now) + 15 * 60 * 1000).toISOString() : existing?.locked_until ?? null,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("DELETE FROM admin_login_attempts")) {
      this.db.attempts.delete(v[0]);
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE admin_users SET last_login_at")) {
      const row = this.db.admins.get(v[1]);
      if (row) row.last_login_at = v[0];
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("UPDATE admin_sessions SET revoked_at")) {
      let changes = 0;
      for (const row of this.db.sessions.values()) if (row.token_hash === v[1] && !row.revoked_at) { row.revoked_at = v[0]; changes += 1; }
      return { success: true, meta: { changes } };
    }
    throw new Error("Unexpected run query: " + q);
  }
}

class FakeD1 {
  admins = new Map();
  sessions = new Map();
  attempts = new Map();
  prepare(sql) { return new FakeStatement(this, sql); }
}

const env = (db, token = "test-bootstrap-token-with-more-than-32-characters") => ({ DB: db, ADMIN_BOOTSTRAP_TOKEN: token });
const origin = "https://deverve.example";
const request = (path, method, body, headers = {}) => new Request(origin + path, {
  method,
  headers: { origin, "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const bootstrap = (db, overrides = {}) => handleRequest(request("/api/admin/bootstrap", "POST", {
  bootstrapToken: "test-bootstrap-token-with-more-than-32-characters",
  email: "owner@deverve.example",
  password: "A-strong-password-2026",
  ...overrides,
}), env(db));
const login = (db, password) => handleRequest(request("/api/admin/login", "POST", {
  email: "owner@deverve.example", password,
}, { "cf-connecting-ip": "203.0.113.10", "sec-fetch-site": "same-origin" }), env(db));

test("bootstrap creates exactly one owner and stores only a hashed session token", async () => {
  const db = new FakeD1();
  const response = await bootstrap(db);
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(db.admins.size, 1);
  assert.equal(db.sessions.size, 1);
  assert.ok(![...db.sessions.values()][0].token_hash.includes(cookie.split("=")[1].split(";")[0]));
  assert.ok(![...db.admins.values()][0].password_hash.includes("A-strong-password-2026"));
  const second = await bootstrap(db, { email: "another@deverve.example" });
  assert.equal(second.status, 409);
  assert.equal(db.admins.size, 1);
});

test("bootstrap rejects cross-origin requests and missing server configuration", async () => {
  const db = new FakeD1();
  const crossOrigin = new Request(origin + "/api/admin/bootstrap", {
    method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ bootstrapToken: "test-bootstrap-token-with-more-than-32-characters", email: "owner@deverve.example", password: "A-strong-password-2026" }),
  });
  assert.equal((await handleRequest(crossOrigin, env(db))).status, 403);
  assert.equal((await handleRequest(request("/api/admin/bootstrap", "POST", {}), env(db, undefined))).status, 503);
});

test("login, current-session lookup and logout use a revocable server-side session", async () => {
  const db = new FakeD1();
  await bootstrap(db);
  const signedIn = await login(db, "A-strong-password-2026");
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get("set-cookie").split(";")[0];
  const me = await handleRequest(new Request(origin + "/api/admin/me", { headers: { cookie } }), env(db));
  assert.equal(me.status, 200);
  assert.equal((await me.json()).admin.role, "owner");
  const loggedOut = await handleRequest(request("/api/admin/logout", "POST", {}, { cookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(loggedOut.status, 200);
  const afterLogout = await handleRequest(new Request(origin + "/api/admin/me", { headers: { cookie } }), env(db));
  assert.equal(afterLogout.status, 401);
});

test("five incorrect passwords trigger a fifteen-minute login lockout", async () => {
  const db = new FakeD1();
  await bootstrap(db);
  for (let attempt = 0; attempt < 4; attempt += 1) assert.equal((await login(db, "incorrect-password")).status, 401);
  assert.equal((await login(db, "incorrect-password")).status, 429);
  assert.equal((await login(db, "A-strong-password-2026")).status, 429);
});
