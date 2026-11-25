import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import retentionWorker from "../workers/deverve-cnic-retention.js";

function makeDb({dueRows=[],documents=[],hold=false,failDelete=false}={}) {
  const calls=[];
  return {
    calls,
    prepare(sql) {
      return {
        sql, values:[],
        bind(...values){this.values=values;return this;},
        async run(){
          calls.push({kind:"run",sql:this.sql,values:this.values});
          if(this.sql.includes("SET cnic_retention_status='purging'")) return {success:true,meta:{changes:1}};
          if(this.sql.includes("SET cnic_retention_status='retry'")) return {success:true,meta:{changes:1}};
          return {success:true,meta:{changes:3}};
        },
        async all(){
          calls.push({kind:"all",sql:this.sql,values:this.values});
          if(this.sql.includes("SELECT id,cnic_retention_due_at")) return {success:true,results:hold?[]:dueRows};
          if(this.sql.includes("SELECT id,object_key FROM rental_documents")) return {success:true,results:documents};
          return {success:true,results:[]};
        },
        async first(){return {ok:1};}
      };
    },
    async batch(statements) {
      const sql=statements.map(s=>s.sql);
      calls.push({kind:"batch",sql});
      if(failDelete) throw new Error("simulated D1 commit failure");
      return [{success:true,meta:{changes:documents.length}},{success:true,meta:{changes:1}},{success:true,meta:{changes:1}}];
    }
  };
}

test("scheduled CNIC maintenance deletes only after a due clearance, records audit and preserves rental history", async () => {
  const db=makeDb({dueRows:[{id:"rental-1",cnic_retention_due_at:"2026-01-01T00:00:00.000Z"}],documents:[
    {id:"front",object_key:"rental-private/rental-1/front-cnic.jpg"},
    {id:"back",object_key:"rental-private/rental-1/back-cnic.jpg"}
  ]});
  const deleted=[];
  await retentionWorker.scheduled({}, {DB:db,MEDIA:{async delete(key){deleted.push(key);}}});
  assert.deepEqual(deleted,["rental-private/rental-1/front-cnic.jpg","rental-private/rental-1/back-cnic.jpg"]);
  const batch=db.calls.find(call=>call.kind==="batch");
  assert.match(batch.sql[0],/DELETE FROM rental_documents/);
  assert.match(batch.sql[1],/cnic_retention_status='deleted'/);
  assert.match(batch.sql[2],/rental\.cnic_retention_deleted/);
  assert.equal(db.calls.some(call=>call.sql?.includes("DELETE FROM rental_requests")),false);
});

test("active legal or business hold blocks CNIC deletion", async () => {
  const db=makeDb({dueRows:[],documents:[{id:"front",object_key:"rental-private/rental-1/front.jpg"}],hold:true});
  const deleted=[];
  await retentionWorker.scheduled({}, {DB:db,MEDIA:{async delete(key){deleted.push(key);}}});
  assert.deepEqual(deleted,[]);
  assert.equal(db.calls.some(call=>call.kind==="batch"),false);
});

test("R2 lock or storage failure preserves D1 evidence and schedules a safe retry", async () => {
  const db=makeDb({dueRows:[{id:"rental-2",cnic_retention_due_at:"2026-01-01T00:00:00.000Z"}],documents:[
    {id:"front",object_key:"rental-private/rental-2/front.jpg"}
  ]});
  await retentionWorker.scheduled({}, {DB:db,MEDIA:{async delete(){throw new Error("ObjectLockedByBucketPolicy");}}});
  assert.equal(db.calls.some(call=>call.kind==="batch"),false);
  assert.equal(db.calls.some(call=>call.sql?.includes("SET cnic_retention_status='retry'")),true);
});

test("unexpected CNIC object keys are never deleted", async () => {
  const db=makeDb({dueRows:[{id:"rental-3",cnic_retention_due_at:"2026-01-01T00:00:00.000Z"}],documents:[
    {id:"front",object_key:"catalogue/other-customer.jpg"}
  ]});
  const deleted=[];
  await retentionWorker.scheduled({}, {DB:db,MEDIA:{async delete(key){deleted.push(key);}}});
  assert.deepEqual(deleted,[]);
  assert.equal(db.calls.some(call=>call.sql?.includes("SET cnic_retention_status='retry'")),true);
});

test("retention health reports the owner/manager clearance policy", async () => {
  const env={DB:{prepare(){return {async first(){return {ok:1};}};}},MEDIA:{async get(){return null;}}};
  const response=await retentionWorker.fetch(new Request("https://retention.example/health"),env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:"ok",database_connected:true,private_storage_binding:true,document_retention:"90_days_after_owner_or_manager_clearance",automatic_deletion_requires_due_clearance_and_no_active_hold:true,legacy_preview_token_expiry_seconds:120});
});

test("CNIC retention migration requires completed clearance, 90 days and no active hold before metadata deletion", () => {
  const migration=readFileSync(new URL("../migrations/0050_cnic_clearance_retention_workflow.sql",import.meta.url),"utf8");
  assert.match(migration,/cnic_retention_due_at/);
  assert.match(migration,/cnic_retention_status = 'purging'/);
  assert.match(migration,/cnic_retention_due_at <=/);
  assert.match(migration,/released_at IS NULL/);
  assert.match(migration,/rental_cnic_clearance_immutable/);
});

test("rental submission preserves the versioned CNIC notice and consent metadata", () => {
  const workerSource=readFileSync(new URL("../worker/index.ts",import.meta.url),"utf8");
  const appSource=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  const migration=readFileSync(new URL("../migrations/0038_rental_cnic_consent_record.sql",import.meta.url),"utf8");
  assert.match(workerSource,/cnic_consent_version/);
  assert.match(workerSource,/rental-cnic-2026-11-21-v1/);
  assert.match(workerSource,/cnic_consent_at/);
  assert.match(appSource,/cnic_consent_version/);
  assert.match(appSource,/90 days after an authorised owner or manager records final clearance/);
  assert.match(migration,/cnic_consent_version TEXT NOT NULL DEFAULT 'legacy-unknown'/);
  assert.match(migration,/cnic_consent_at TEXT/);
});


test("overlapping scheduled runs cannot both claim or delete the same rental", async () => {
  const state = { status: "scheduled", claimToken: null, claimExpiresAt: null, deletedAt: null };
  const calls = [];
  const db = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { this.values = values; return this; } };
      statement.run = async () => {
        calls.push({ kind: "run", sql, values: statement.values });
        if (sql.includes("SET cnic_retention_status='purging'")) {
          const [token, expiresAt, _claimedAt, rentalId, _dueAt, reclaimAt] = statement.values;
          const eligible = state.status === "scheduled" || state.status === "retry"
            || (state.status === "purging" && (!state.claimExpiresAt || state.claimExpiresAt <= reclaimAt));
          if (!eligible || rentalId !== "rental-concurrent") return { meta: { changes: 0 } };
          state.status = "purging";
          state.claimToken = token;
          state.claimExpiresAt = expiresAt;
          return { meta: { changes: 1 } };
        }
        if (sql.includes("SET cnic_retention_status='retry'")) {
          const token = statement.values[3];
          if (state.status === "purging" && state.claimToken === token) {
            state.status = "retry"; state.claimToken = null; state.claimExpiresAt = null;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        return { meta: { changes: 0 } };
      };
      statement.all = async () => {
        calls.push({ kind: "all", sql, values: statement.values });
        if (sql.includes("SELECT id,cnic_retention_due_at")) return { results: [{ id: "rental-concurrent", cnic_retention_due_at: "2026-01-01T00:00:00.000Z" }] };
        if (sql.includes("SELECT id,object_key FROM rental_documents")) return { results: [{ id: "front", object_key: "rental-private/rental-concurrent/front.jpg" }] };
        return { results: [] };
      };
      statement.first = async () => ({ ok: 1 });
      return statement;
    },
    async batch(statements) {
      calls.push({ kind: "batch" });
      const update = statements[1];
      const token = update.values[3];
      if (state.status !== "purging" || state.claimToken !== token) {
        return [{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }];
      }
      state.status = "deleted"; state.deletedAt = update.values[0]; state.claimToken = null; state.claimExpiresAt = null;
      return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }];
    },
  };
  const deleted = [];
  const env = { DB: db, MEDIA: { async delete(key) { deleted.push(key); } } };
  await Promise.all([
    retentionWorker.scheduled({}, env),
    retentionWorker.scheduled({}, env),
  ]);
  assert.equal(state.status, "deleted");
  assert.equal(deleted.length, 1, "Only the execution holding the claim may delete the R2 object");
  assert.equal(calls.filter(call => call.kind === "batch").length, 1, "Only one execution may commit deletion metadata and audit evidence");
});
