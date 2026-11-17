import test from "node:test";
import assert from "node:assert/strict";
import retentionWorker from "../workers/deverve-cnic-retention.js";

test("scheduled CNIC maintenance revokes expired upload tokens but never deletes stored documents", async () => {
  const executedSql=[];
  const db={prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},async run(){executedSql.push({sql:this.sql,values:this.values});return {success:true,meta:{changes:3}};},async all(){throw new Error("Must not query documents for deletion");}};},async batch(){throw new Error("Must not batch document deletion");}};
  const deletedObjects=[];
  await retentionWorker.scheduled({}, {DB:db,MEDIA:{async delete(key){deletedObjects.push(key);}}});
  assert.equal(executedSql.length,1);
  assert.match(executedSql[0].sql,/document_upload_token_hash = NULL/);
  assert.match(executedSql[0].sql,/document_upload_expires_at = NULL/);
  assert.doesNotMatch(executedSql[0].sql,/DELETE FROM rental_documents/i);
  assert.deepEqual(deletedObjects,[]);
});

test("retention health reports indefinite private document retention", async () => {
  const env={DB:{prepare(){return {async first(){return {ok:1};}};}},MEDIA:{async get(){return null;}}};
  const response=await retentionWorker.fetch(new Request("https://retention.example/health"),env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:"ok",database_connected:true,private_storage_binding:true,document_retention:"indefinite",automatic_document_deletion:false,legacy_preview_token_expiry_seconds:120});
});
