import test from "node:test";
import assert from "node:assert/strict";
import retentionWorker from "../workers/deverve-cnic-retention.js";

test("scheduled CNIC retention revokes expired upload links and deletes closed or abandoned requests", async () => {
  const deletedObjects = [];
  const executedSql = [];
  const batchStatements = [];
  const rows = [
    { id: "doc-closed", object_key: "rental-private/closed/front.jpg", rental_request_id: "rental-closed", document_side: "cnic_front" },
    { id: "doc-abandoned", object_key: "rental-private/abandoned/back.jpg", rental_request_id: "rental-abandoned", document_side: "cnic_back" },
  ];
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() {
          executedSql.push({ sql: this.sql, values: this.values });
          return { success: true, meta: { changes: 3 } };
        },
        async all() {
          executedSql.push({ sql: this.sql, values: this.values });
          return { success: true, results: rows };
        },
      };
      return statement;
    },
    async batch(statements) {
      batchStatements.push(statements);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  const env = {
    DB: db,
    MEDIA: { async delete(key) { deletedObjects.push(key); } },
  };

  await retentionWorker.scheduled({}, env);

  assert.deepEqual(deletedObjects.sort(), rows.map(row => row.object_key).sort());
  assert.equal(batchStatements.length, 2);
  assert.equal(batchStatements.flat().length, 4);
  assert.equal(executedSql.length, 2);
  assert.match(executedSql[0].sql, /document_upload_token_hash = NULL/);
  assert.doesNotMatch(executedSql[0].sql, /updated_at/);
  const [closedCutoff, abandonedCutoff] = executedSql[1].values;
  const now = Date.now();
  assert.ok(Math.abs((now - Date.parse(closedCutoff)) - 30 * 86400000) < 10000);
  assert.ok(Math.abs((now - Date.parse(abandonedCutoff)) - 90 * 86400000) < 10000);
});

test("failed private-object deletion leaves its database record untouched for a later retry", async () => {
  let batchCalled = false;
  const env = {
    DB: {
      prepare(sql) {
        return {
          sql,
          values: [],
          bind(...values) { this.values = values; return this; },
          async run() { return { success: true, meta: { changes: 0 } }; },
          async all() { return { success: true, results: [{ id: "doc-1", object_key: "rental-private/doc-1.jpg", rental_request_id: "rental-1", document_side: "cnic_front" }] }; },
        };
      },
      async batch() { batchCalled = true; },
    },
    MEDIA: { async delete() { throw new Error("R2 unavailable"); } },
  };

  await retentionWorker.scheduled({}, env);
  assert.equal(batchCalled, false);
});
