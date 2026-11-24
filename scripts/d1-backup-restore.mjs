import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
const API="https://api.cloudflare.com/client/v4";
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,databaseId=process.env.D1_DATABASE_ID;
const databaseName=process.env.D1_DATABASE_NAME||"deverve-production",bucket=process.env.D1_BACKUP_R2_BUCKET||"deverve-db-backups";
const keyHex=process.env.D1_BACKUP_ENCRYPTION_KEY||"",keyId=process.env.D1_BACKUP_KEY_ID||"deverve-d1-key-v1";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const required=(v,n)=>{if(!v)throw new Error("Missing required GitHub Actions secret/environment value: "+n);return v;};
required(accountId,"CLOUDFLARE_ACCOUNT_ID");required(token,"CLOUDFLARE_API_TOKEN");required(databaseId,"D1_DATABASE_ID");
if(!/^[a-f0-9]{64}$/i.test(keyHex))throw new Error("D1_BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters. Generate it locally with: openssl rand -hex 32");
const encryptionKey=Buffer.from(keyHex,"hex");
async function api(method,path,body){
 const response=await fetch(API+path,{method,headers:{Authorization:"Bearer "+token,...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok||payload.success!==true){const message=payload.errors?.map(x=>x.message).filter(Boolean).join("; ");throw new Error("Cloudflare API "+method+" failed ("+response.status+"): "+(message||"request unsuccessful"));}
 return payload.result;
}
async function putR2(key,body,contentType){
 const encoded=key.split("/").map(encodeURIComponent).join("/");
 const response=await fetch(API+"/accounts/"+accountId+"/r2/buckets/"+bucket+"/objects/"+encoded,{method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":contentType},body,signal:AbortSignal.timeout(120000)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok||payload.success===false){const message=payload.errors?.map(x=>x.message).filter(Boolean).join("; ");throw new Error("Private R2 upload failed ("+response.status+"): "+(message||"check R2 Storage Edit permission"));}
}
async function getR2(key){
 const encoded=key.split("/").map(encodeURIComponent).join("/");
 const response=await fetch(API+"/accounts/"+accountId+"/r2/buckets/"+bucket+"/objects/"+encoded,{method:"GET",headers:{Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(120000)});
 if(!response.ok){const payload=await response.json().catch(()=>({}));const message=payload.errors?.map(x=>x.message).filter(Boolean).join("; ");throw new Error("Private R2 read-back failed ("+response.status+"): "+(message||"check R2 Object Read permission"));}
 return Buffer.from(await response.arrayBuffer());
}
async function queryRows(id,sql){
 const result=await api("POST","/accounts/"+accountId+"/d1/database/"+id+"/query",{sql});
 return (Array.isArray(result)?result:[]).flatMap(item=>item.results||[]);
}
async function snapshot(id){
 const rows=await queryRows(id,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV' ORDER BY name");
 const tables=rows.map(row=>row.name).filter(name=>typeof name==="string");
 if(tables.length<10)throw new Error("D1 schema snapshot is unexpectedly small.");
 const countQueries=tables.map(name=>{const literal=name.replace(/'/g,"''"),identifier=name.replace(/"/g,'""');return {sql:"SELECT '"+literal+"' AS table_name, COUNT(*) AS row_count FROM \""+identifier+"\""};});
 const counts=[];
 for(let offset=0;offset<countQueries.length;offset+=20){
  const batch=await api("POST","/accounts/"+accountId+"/d1/database/"+id+"/query",{batch:countQueries.slice(offset,offset+20)});
  counts.push(...(Array.isArray(batch)?batch:[]).flatMap(item=>item.results||[]));
 }
 const rowCounts=Object.fromEntries(counts.map(row=>[row.table_name,Number(row.row_count)]));
 const objects=await queryRows(id,"SELECT type, COUNT(*) AS count FROM sqlite_master WHERE type IN ('table','index','trigger','view') AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV' GROUP BY type ORDER BY type");
 const definitions=await queryRows(id,"SELECT type,name,tbl_name,COALESCE(sql,'') AS sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV' ORDER BY type,name");
 return {tables,rowCounts,schemaObjects:Object.fromEntries(objects.map(row=>[row.type,Number(row.count)])),schemaDefinitions:definitions.map(row=>({type:row.type,name:row.name,table:row.tbl_name,sql:row.sql}))};
}
function stable(value){if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";return JSON.stringify(value);}
const sha=data=>createHash("sha256").update(data).digest("hex");
function encrypt(sql){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey,iv),ciphertext=Buffer.concat([cipher.update(sql),cipher.final()]);return Buffer.concat([Buffer.from("DVDBKUP1","ascii"),iv,cipher.getAuthTag(),ciphertext]);}
function decrypt(archive){if(archive.subarray(0,8).toString("ascii")!=="DVDBKUP1"||archive.length<36)throw new Error("Invalid encrypted backup header.");const decipher=createDecipheriv("aes-256-gcm",encryptionKey,archive.subarray(8,20));decipher.setAuthTag(archive.subarray(20,36));return Buffer.concat([decipher.update(archive.subarray(36)),decipher.final()]);}
async function latestSuccessfulBackup(){
 const prefix="manifests/"+databaseName+"-";
 const objects=await api("GET","/accounts/"+accountId+"/r2/buckets/"+bucket+"/objects?prefix="+encodeURIComponent(prefix)+"&per_page=100");
 const candidates=(Array.isArray(objects)?objects:[]).map(item=>item.key).filter(key=>typeof key==="string"&&key.startsWith(prefix)).sort().reverse();
 for(const manifestKey of candidates){
  const manifestBytes=await getR2(manifestKey);
  let manifest;
  try{manifest=JSON.parse(manifestBytes.toString("utf8"));}catch{continue;}
  const age=Date.now()-new Date(manifest.created_at||"").getTime();
  if(manifest.restore_status!=="passed"||manifest.encrypted!==true||manifest.algorithm!=="AES-256-GCM"||
     manifest.key_id!==keyId||manifest.database_id!==databaseId||manifest.database_name!==databaseName||
     typeof manifest.backup_object!=="string"||!Number.isFinite(age)||age<0||age>7*24*60*60*1000)continue;
  const archive=await getR2(manifest.backup_object);
  if(archive.length!==manifest.backup_bytes||sha(archive)!==manifest.ciphertext_sha256)throw new Error("Latest successful D1 backup archive failed its ciphertext integrity check.");
  const sql=decrypt(archive);
  if(sql.length!==manifest.plaintext_bytes||sha(sql)!==manifest.plaintext_sha256)throw new Error("Latest successful D1 backup archive failed its plaintext integrity check.");
  return {sql,manifest,manifestKey};
 }
 throw new Error("No recent successful encrypted D1 backup with a verified restore was found in the private R2 bucket.");
}
async function exportSql(dumpOptions={}){
 const path="/accounts/"+accountId+"/d1/database/"+databaseId+"/export";
 let state=await api("POST",path,{output_format:"polling",dump_options:{compatibility:"d1",...dumpOptions}}),bookmark=state.at_bookmark;
 for(let i=0;i<180&&state.status!=="complete";i++){if(state.status==="error")throw new Error("D1 export failed: "+(state.error||"unknown"));await sleep(1000);state=await api("POST",path,{output_format:"polling",current_bookmark:bookmark});bookmark=state.at_bookmark||bookmark;}
 if(state.status!=="complete"||!state.result?.signed_url||!bookmark)throw new Error("D1 export did not complete within three minutes.");
 const response=await fetch(state.result.signed_url,{cache:"no-store",signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error("D1 export download failed ("+response.status+").");
 const sql=Buffer.from(await response.arrayBuffer());
 const sample=sql.toString("utf8",0,Math.min(sql.length,2000000));if(sql.length<32||(dumpOptions.no_schema?!/INSERT INTO/i.test(sample):!/CREATE TABLE/i.test(sample)))throw new Error("D1 export is empty or missing the requested SQL content.");
 return {sql,bookmark};
}
async function restoreDrill(sql,expected){
 const name="deverve-restore-drill-"+new Date().toISOString().replace(/\D/g,"").slice(0,14)+"-"+randomBytes(3).toString("hex");let id;
 try{
  const created=await api("POST","/accounts/"+accountId+"/d1/database",{name,primary_location_hint:"apac"});id=created.uuid;if(!id)throw new Error("Temporary D1 database creation returned no ID.");
  const queryPath="/accounts/"+accountId+"/d1/database/"+id+"/query",sqlText=sql.toString("utf8");
  if(Buffer.byteLength(sqlText,"utf8")>512*1024)throw new Error("Restore SQL exceeds the safe D1 query-batch size; use a chunked dependency-ordered restore.");
  const imported=await api("POST",queryPath,{sql:sqlText});
  const restored=await snapshot(id);
  if(stable(restored.tables)!==stable(expected.tables))throw new Error("Restored table set differs from the production export.");
  if(stable(restored.schemaObjects)!==stable(expected.schemaObjects))throw new Error("Restored schema-object counts differ from the production export.");
  if(stable(restored.schemaDefinitions)!==stable(expected.schemaDefinitions))throw new Error("Restored table/index/trigger/view definitions differ from the production export.");
  const compareRows=expected.rowCounts!==null&&expected.rowCounts!==undefined;
  if(compareRows&&stable(restored.rowCounts)!==stable(expected.rowCounts))throw new Error("Restored row counts differ from the exported snapshot.");
  let offlineMigrationRehearsal=null;
  if(process.env.OFFLINE_POS_MIGRATION_CHECK==="true"){
   const migrationFiles=[
    "0045_pos_offline_emergency_foundation.sql",
    "0046_pos_offline_enrollment_challenges.sql",
    "0047_pos_offline_permit_guards.sql",
    "0048_pos_offline_permit_snapshot.sql",
    "0049_pos_offline_private_cost_snapshot.sql"
   ];
   const foreignKeysBefore=await queryRows(id,"PRAGMA foreign_key_check");
   for(const filename of migrationFiles){
    const migration=await readFile(new URL("../migrations/"+filename,import.meta.url),"utf8");
    await api("POST",queryPath,{sql:migration});
    console.log("APPLIED TO RESTORED PRODUCTION CLONE",filename);
   }
   const migrated=await snapshot(id);
   const expectedTables=["pos_offline_devices","pos_offline_permits","pos_offline_stock_allocations","pos_offline_events","pos_offline_reconciliation_cases","pos_offline_reconciliation_actions","pos_offline_enrollment_challenges"];
   const tableSet=new Set(migrated.tables);
   if(!expectedTables.every(name=>tableSet.has(name)))throw new Error("Offline-POS migrations did not create every required table on the production clone.");
   const expectedTriggers=["pos_offline_device_identity_immutable","pos_offline_device_no_delete","pos_offline_event_payload_immutable","pos_offline_event_no_delete","pos_offline_reconciliation_action_no_update","pos_offline_reconciliation_action_no_delete","pos_offline_allocation_reserve_on_insert","pos_offline_allocation_guard_update","pos_offline_allocation_reserve_on_update","pos_offline_allocation_no_delete","pos_offline_enrollment_challenge_update_guard","pos_offline_permit_authorization_guard","pos_offline_allocation_insert_guard_during_permit","pos_offline_allocation_release_guard_during_permit","pos_offline_permit_identity_immutable","pos_offline_permit_no_delete","pos_offline_permit_snapshot_guard","pos_offline_permit_snapshot_immutable","pos_offline_permit_cost_snapshot_guard","pos_offline_permit_cost_snapshot_immutable"];
   const triggerRows=await queryRows(id,"SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'pos_offline_%'");
   const triggerSet=new Set(triggerRows.map(row=>row.name));
   if(!expectedTriggers.every(name=>triggerSet.has(name)))throw new Error("Offline-POS migration rehearsal is missing one or more required guard triggers.");
   const permitColumns=await queryRows(id,"PRAGMA table_info(pos_offline_permits)");
   if(!permitColumns.some(column=>column.name==="cost_snapshot_json"))throw new Error("Server-only offline permit cost snapshot column was not installed.");
   for(const [table,count] of Object.entries(restored.rowCounts)){
    if(migrated.rowCounts[table]!==count)throw new Error("Offline-POS migrations unexpectedly changed existing production-clone row counts in "+table+".");
   }
   const foreignKeysAfter=await queryRows(id,"PRAGMA foreign_key_check");
   if(stable(foreignKeysAfter)!==stable(foreignKeysBefore))throw new Error("Offline-POS migrations introduced a foreign-key violation on the production clone.");
   offlineMigrationRehearsal={status:"passed",migrations:migrationFiles.length,offline_tables:expectedTables.length,guard_triggers:expectedTriggers.length,existing_row_counts_unchanged:true,foreign_key_check:"no_new_violations"};
  }
  const total=Object.values(restored.rowCounts).reduce((sum,n)=>sum+n,0);if(total===0)throw new Error("Restored database contains no application rows.");
  return {status:"passed",table_count:restored.tables.length,schema_objects:restored.schemaObjects,row_count_check:compareRows?"passed":"skipped_due_to_concurrent_production_writes",row_counts_sha256:sha(Buffer.from(stable(restored.rowCounts))),imported_queries:Array.isArray(imported)?imported.length:null,offline_migration_rehearsal:offlineMigrationRehearsal};
 }finally{if(id){try{await api("DELETE","/accounts/"+accountId+"/d1/database/"+id);}catch(error){console.error("ERROR: temporary D1 restore database cleanup failed:",name,error instanceof Error?error.message:"unknown error");throw new Error("Restore drill cannot pass because its temporary D1 database was not confirmed deleted.");}}}
}
async function main(){
 if(process.env.OFFLINE_POS_MIGRATION_CHECK==="true"){
  const {sql,manifest,manifestKey}=await latestSuccessfulBackup();
  const current=await snapshot(databaseId);
  if(manifest.table_count!==current.tables.length||stable(manifest.schema_objects)!==stable(current.schemaObjects))throw new Error("Latest successful backup schema no longer matches production; create a fresh verified backup before migration rehearsal.");
  const rowCountsStable=sha(Buffer.from(stable(current.rowCounts)))===manifest.row_counts_sha256;
  const restoreSql=Buffer.concat([Buffer.from("PRAGMA defer_foreign_keys = true;\n","utf8"),sql]);
  const drill=await restoreDrill(restoreSql,{...current,rowCounts:rowCountsStable?current.rowCounts:null});
  if(drill.offline_migration_rehearsal?.status!=="passed")throw new Error("Offline-POS production-clone migration rehearsal did not pass.");
  console.log(JSON.stringify({mode:"offline_pos_production_clone_migration_rehearsal",source_backup_object:manifest.backup_object,source_manifest:manifestKey,backup_created_at:manifest.created_at,source_row_counts_match:rowCountsStable,...drill,temporary_database_deleted:true}));
  return;
 }
 const before=await snapshot(databaseId);
 const schemaExport=await exportSql({no_data:true});
 const dataExport=await exportSql({no_schema:true});
 const sql=Buffer.concat([schemaExport.sql,Buffer.from("\n","utf8"),dataExport.sql]);
 const bookmark=dataExport.bookmark,after=await snapshot(databaseId);
 if(stable(before.tables)!==stable(after.tables)||stable(before.schemaObjects)!==stable(after.schemaObjects)||stable(before.schemaDefinitions)!==stable(after.schemaDefinitions))throw new Error("Production D1 schema changed during export.");
 const stableRows=stable(before.rowCounts)===stable(after.rowCounts);
 const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
 const backupKey="d1/encrypted/"+databaseName+"-"+stamp+".dvbackup",manifestKey="manifests/"+databaseName+"-"+stamp+".json";
 const archive=encrypt(sql),localPlain=decrypt(archive);if(sha(localPlain)!==sha(sql))throw new Error("AES-256-GCM local self-check failed.");
 await putR2(backupKey,archive,"application/octet-stream");
 const storedArchive=await getR2(backupKey);
 if(storedArchive.length!==archive.length||sha(storedArchive)!==sha(archive))throw new Error("R2 backup read-back checksum or byte-length mismatch.");
 const plain=decrypt(storedArchive);if(sha(plain)!==sha(sql))throw new Error("R2 backup plaintext checksum mismatch after decryption.");
 const restoreSql=Buffer.concat([Buffer.from("PRAGMA defer_foreign_keys = true;\n","utf8"),plain]);
 const manifest={format:"deverve-d1-backup-v1",database_name:databaseName,database_id:databaseId,created_at:new Date().toISOString(),source_bookmark:bookmark,source_commit:process.env.GITHUB_SHA||null,encrypted:true,algorithm:"AES-256-GCM",archive_header:"DVDBKUP1",key_id:keyId,backup_object:backupKey,backup_bytes:archive.length,r2_readback_verified:true,r2_readback_bytes:storedArchive.length,ciphertext_sha256:sha(storedArchive),plaintext_bytes:sql.length,plaintext_sha256:sha(plain),table_count:before.tables.length,schema_objects:before.schemaObjects,row_counts_sha256:sha(Buffer.from(stable(before.rowCounts))),row_count_snapshot_stable_during_export:stableRows,restore_status:"running"};
 await putR2(manifestKey,Buffer.from(JSON.stringify(manifest,null,2)),"application/json");
 try{const drill=await restoreDrill(restoreSql,{...before,rowCounts:stableRows?before.rowCounts:null});manifest.restore_status=drill.status;manifest.restore_completed_at=new Date().toISOString();manifest.restore_verification=drill;await putR2(manifestKey,Buffer.from(JSON.stringify(manifest,null,2)),"application/json");console.log(JSON.stringify({backup:"uploaded_encrypted",bucket,backup_object:backupKey,manifest_object:manifestKey,backup_bytes:archive.length,r2_readback_verified:true,table_count:before.tables.length,restore_status:drill.status,temporary_database_deleted:true}));}
 catch(error){manifest.restore_status="failed";manifest.restore_completed_at=new Date().toISOString();manifest.restore_failure=error instanceof Error?error.name:"UnknownError";try{await putR2(manifestKey,Buffer.from(JSON.stringify(manifest,null,2)),"application/json");}catch{}throw error;}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"D1 encrypted backup/restore failed.");process.exitCode=1;});
