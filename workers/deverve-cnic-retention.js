export default {
  async scheduled(_controller, env) {
    const now = new Date().toISOString();
    const closedCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const abandonedCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Expired upload links are revoked without changing the rental's business updated_at timestamp.
    const expiredTokens = await env.DB.prepare(
      "UPDATE rental_requests SET document_upload_token_hash = NULL, document_upload_expires_at = NULL WHERE document_upload_expires_at IS NOT NULL AND document_upload_expires_at <= ?"
    ).bind(now).run();

    const rows = await env.DB.prepare(
      "SELECT d.id, d.object_key, d.rental_request_id, d.document_side FROM rental_documents d JOIN rental_requests r ON r.id = d.rental_request_id WHERE (r.status IN ('completed','cancelled') AND r.updated_at <= ?) OR (r.status IN ('requested','reviewing') AND r.created_at <= ?) ORDER BY r.updated_at ASC LIMIT 100"
    ).bind(closedCutoff, abandonedCutoff).all();

    let deleted = 0;
    let failed = 0;
    for (const row of rows.results || []) {
      try {
        await env.MEDIA.delete(row.object_key);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM rental_documents WHERE id = ? AND object_key = ?").bind(row.id, row.object_key),
          env.DB.prepare("INSERT INTO audit_logs (id, actor_admin_id, action, entity_type, entity_id, metadata_json) VALUES (?, NULL, 'rental.document_auto_deleted', 'rental_request', ?, ?)").bind(
            crypto.randomUUID(),
            row.rental_request_id,
            JSON.stringify({ side: row.document_side, reason: "30-day post-closure or 90-day abandoned-request retention expiry" })
          )
        ]);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }
    console.log(JSON.stringify({
      event: "cnic-retention-cleanup",
      deleted,
      failed,
      expired_upload_tokens: expiredTokens.meta?.changes || 0
    }));
  },
  async fetch() {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  }
};
