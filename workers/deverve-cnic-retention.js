export default {
  async scheduled(_controller, env) {
    const now = new Date().toISOString();
    // Upload tokens are temporary credentials, not the stored CNIC files.
    // Expiring a token never changes or deletes private R2 document objects.
    const expiredTokens = await env.DB.prepare(
      "UPDATE rental_requests SET document_upload_token_hash = NULL, document_upload_expires_at = NULL WHERE document_upload_expires_at IS NOT NULL AND document_upload_expires_at <= ?"
    ).bind(now).run();
    console.log(JSON.stringify({event:"cnic-upload-token-cleanup",documents_deleted:0,automatic_document_deletion:false,expired_upload_tokens:expiredTokens.meta?.changes||0}));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      try {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        const healthy = result?.ok === 1 && Boolean(env.MEDIA);
        return new Response(JSON.stringify({status:healthy?"ok":"unavailable",database_connected:result?.ok===1,private_storage_binding:Boolean(env.MEDIA),document_retention:"indefinite",automatic_document_deletion:false,legacy_preview_token_expiry_seconds:120}), {
          status:healthy?200:503,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}
        });
      } catch {
        return new Response(JSON.stringify({status:"unavailable"}),{status:503,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
      }
    }
    return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
  }
};
