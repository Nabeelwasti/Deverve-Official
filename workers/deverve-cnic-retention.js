const MAX_PURGES_PER_RUN = 10;
const CLAIM_LEASE_MS = 30 * 60 * 1000;

async function recordRetry(env, rentalId, code, claimToken) {
  try {
    await env.DB.prepare(
      "UPDATE rental_requests SET cnic_retention_status='retry',cnic_retention_claim_token=NULL,cnic_retention_claim_expires_at=NULL,cnic_retention_last_error=?,updated_at=? WHERE id=? AND cnic_retention_status='purging' AND cnic_retention_claim_token=?"
    ).bind(code, new Date().toISOString(), rentalId, claimToken).run();
  } catch {
    // Keep the claim until it expires. A later scheduled run can safely reclaim
    // it; R2 deletion is idempotent and every D1 mutation is claim-token guarded.
  }
}

export default {
  async scheduled(_controller, env) {
    const now = new Date().toISOString();
    let expiredUploadTokens = 0;
    try {
      const expired = await env.DB.prepare(
        "UPDATE rental_requests SET document_upload_token_hash = NULL, document_upload_expires_at = NULL WHERE document_upload_expires_at IS NOT NULL AND document_upload_expires_at <= ?"
      ).bind(now).run();
      expiredUploadTokens = Number(expired.meta?.changes ?? 0);
    } catch (error) {
      console.error(JSON.stringify({event:"cnic-upload-token-cleanup-failed",error_code:"d1_unavailable"}));
    }

    let dueRows = [];
    try {
      const due = await env.DB.prepare(
        "SELECT id,cnic_retention_due_at FROM rental_requests r WHERE (r.cnic_retention_status IN ('scheduled','retry') OR (r.cnic_retention_status='purging' AND (r.cnic_retention_claim_expires_at IS NULL OR r.cnic_retention_claim_expires_at <= ?))) AND r.cnic_retention_due_at IS NOT NULL AND r.cnic_retention_due_at <= ? AND NOT EXISTS (SELECT 1 FROM rental_cnic_holds h WHERE h.rental_request_id=r.id AND h.released_at IS NULL) ORDER BY r.cnic_retention_due_at,r.id LIMIT ?"
      ).bind(now, now, MAX_PURGES_PER_RUN).all();
      dueRows = due.results ?? [];
    } catch (error) {
      console.error(JSON.stringify({event:"cnic-retention-scan-failed",error_code:"d1_unavailable",expired_upload_tokens:expiredUploadTokens}));
      return;
    }

    let completed = 0, retried = 0, skipped = 0;
    for (const row of dueRows) {
      const rentalId = String(row.id || "");
      if (!rentalId) { skipped++; continue; }
      const claimToken = crypto.randomUUID();
      const claimedAt = new Date().toISOString();
      const claimExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();
      try {
        const claim = await env.DB.prepare(
          "UPDATE rental_requests SET cnic_retention_status='purging',cnic_retention_claim_token=?,cnic_retention_claim_expires_at=?,cnic_retention_last_error=NULL,updated_at=? WHERE id=? AND cnic_retention_due_at IS NOT NULL AND cnic_retention_due_at <= ? AND NOT EXISTS (SELECT 1 FROM rental_cnic_holds h WHERE h.rental_request_id=rental_requests.id AND h.released_at IS NULL) AND (cnic_retention_status IN ('scheduled','retry') OR (cnic_retention_status='purging' AND (cnic_retention_claim_expires_at IS NULL OR cnic_retention_claim_expires_at <= ?)))"
        ).bind(claimToken, claimExpiresAt, claimedAt, rentalId, now, now).run();
        if (Number(claim.meta?.changes ?? 0) !== 1) { skipped++; continue; }

        const docs = await env.DB.prepare(
          "SELECT id,object_key FROM rental_documents WHERE rental_request_id=? ORDER BY document_side"
        ).bind(rentalId).all();
        const records = docs.results ?? [];
        for (const doc of records) {
          const objectKey = String(doc.object_key || "");
          if (!objectKey.startsWith("rental-private/" + rentalId + "/")) throw new Error("object_key_scope_invalid");
          await env.MEDIA.delete(objectKey);
        }

        const completedAt = new Date().toISOString();
        const written = await env.DB.batch([
          env.DB.prepare("DELETE FROM rental_documents WHERE rental_request_id=? AND EXISTS (SELECT 1 FROM rental_requests WHERE id=? AND cnic_retention_status='purging' AND cnic_retention_claim_token=? AND cnic_retention_claim_expires_at>? AND cnic_retention_due_at<=? AND NOT EXISTS (SELECT 1 FROM rental_cnic_holds h WHERE h.rental_request_id=rental_requests.id AND h.released_at IS NULL))").bind(rentalId,rentalId,claimToken,completedAt,now),
          env.DB.prepare("UPDATE rental_requests SET cnic_retention_status='deleted',cnic_retention_claim_token=NULL,cnic_retention_claim_expires_at=NULL,cnic_retention_deleted_at=?,cnic_retention_last_error=NULL,updated_at=? WHERE id=? AND cnic_retention_status='purging' AND cnic_retention_claim_token=? AND cnic_retention_claim_expires_at>? AND cnic_retention_due_at<=? AND NOT EXISTS (SELECT 1 FROM rental_cnic_holds h WHERE h.rental_request_id=rental_requests.id AND h.released_at IS NULL)").bind(completedAt,completedAt,rentalId,claimToken,completedAt,now),
          env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,entity_type,entity_id,metadata_json) SELECT ?,NULL,'rental.cnic_retention_deleted','rental_request',?,? WHERE EXISTS (SELECT 1 FROM rental_requests WHERE id=? AND cnic_retention_status='deleted' AND cnic_retention_deleted_at=?)").bind(crypto.randomUUID(),rentalId,JSON.stringify({document_count:records.length,retention_due_at:row.cnic_retention_due_at,retention_days:90,storage:"private_r2"}),rentalId,completedAt),
        ]);
        if (Number(written[1]?.meta?.changes ?? 0) !== 1 || Number(written[2]?.meta?.changes ?? 0) !== 1) throw new Error("d1_retention_commit_unverified");
        completed++;
      } catch (error) {
        await recordRetry(env, rentalId, error instanceof Error && error.message === "object_key_scope_invalid" ? "object_key_scope_invalid" : "r2_or_d1_delete_failed", claimToken);
        retried++;
        console.error(JSON.stringify({event:"cnic-retention-delete-retry",rental_id:rentalId,error_code:error instanceof Error && error.message === "object_key_scope_invalid" ? "object_key_scope_invalid" : "r2_or_d1_delete_failed"}));
      }
    }
    console.log(JSON.stringify({
      event:"cnic-retention-run",
      expired_upload_tokens:expiredUploadTokens,
      due_records:dueRows.length,
      deleted_records:completed,
      retry_records:retried,
      skipped_records:skipped,
      retention_days_after_owner_manager_clearance:90
    }));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        const healthy = result?.ok === 1 && Boolean(env.MEDIA);
        return new Response(JSON.stringify({status:healthy?"ok":"unavailable",database_connected:result?.ok===1,private_storage_binding:Boolean(env.MEDIA),document_retention:"90_days_after_owner_or_manager_clearance",automatic_deletion_requires_due_clearance_and_no_active_hold:true,legacy_preview_token_expiry_seconds:120}), {
          status:healthy?200:503,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}
        });
      } catch {
        return new Response(JSON.stringify({status:"unavailable"}),{status:503,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
      }
    }
    return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
  }
};
