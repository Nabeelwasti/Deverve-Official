test("website enquiries can be submitted without a blocked Turnstile widget and are queued for owner email", async () => {
 const db=new FakeD1();
 const response=await handleRequest(new Request(origin+"/api/enquiries",{method:"POST",headers:{origin,"content-type":"application/json","cf-connecting-ip":"203.0.113.88"},body:JSON.stringify({name:"Contact Form Customer",phone:"+923001234567",email:"customer@example.com",enquiryType:"complaint",message:"Please contact me about my order.",website:""})}),env(db));
 assert.equal(response.status,201);assert.equal((await response.json()).accepted,true);assert.equal(db.enquiries.size,1);assert.equal(db.enquiryEmailQueue.size,1);assert.equal([...db.enquiryEmailQueue.values()][0].status,"queued");
});

import test from "node:test";
import assert from "node:assert/strict";
import { aggregateOrderVariantQuantities, buildPosStockGuard, buildSafepayCheckoutUrl, callGemini, customerLanguageHint, handleRequest, importConfiguredGeminiEnvKeys, isSafeNotificationRecipient, isValidEmailAddress, isWithinExchangeWindow, parseRentalDateTime, processEnquiryEmailQueue, processNotificationOutbox, processPosReceiptOutbox, selectOrderPromotion, verifySafepaySignature } from "../.test-dist/worker/index.js";
import safepayQueueConsumer from "../.test-dist/workers/safepay-consumer/index.js";

test("order inventory aggregation combines duplicate variant lines before cancellation or dispatch", () => {
  assert.deepEqual(aggregateOrderVariantQuantities([
    { variant_id: "variant-black-m", quantity: 2 },
    { variant_id: "variant-blue-l", quantity: 1 },
    { variant_id: "variant-black-m", quantity: 3 },
    { variant_id: null, quantity: 1 },
  ]), [
    { variant_id: "variant-black-m", quantity: 5 },
    { variant_id: "variant-blue-l", quantity: 1 },
  ]);
  assert.throws(() => aggregateOrderVariantQuantities([{ variant_id: "v1", quantity: 0 }]), /positive integer/);
  assert.throws(() => aggregateOrderVariantQuantities([{ variant_id: "v1", quantity: 1.5 }]), /positive integer/);
  assert.throws(() => aggregateOrderVariantQuantities([{ variant_id: "v1", quantity: Number.MAX_SAFE_INTEGER }, { variant_id: "v1", quantity: 1 }]), /supported range/);
});

test("POS stock guard binds every exact variant and rejects oversold combined quantities", () => {
  const guard = buildPosStockGuard([
    { variant_id: "variant-black-s", quantity: 2 },
    { variant_id: "variant-blue-m", quantity: 1 },
  ]);
  assert.equal((guard.sql.match(/stock_on_hand-v\.reserved_quantity>=\?/g) ?? []).length, 2);
  assert.deepEqual(guard.bindings, ["variant-black-s", 2, "variant-blue-m", 1]);
  assert.throws(() => buildPosStockGuard([]), /at least one variant/);
  assert.throws(() => buildPosStockGuard([{ variant_id: "variant", quantity: 0 }]), /positive integer quantities/);
});

test("AI support language signal distinguishes Urdu script, Roman Urdu and ordinary English", () => {
  assert.match(customerLanguageHint("مجھے اس کی قیمت بتائیں"), /Arabic-derived script/);
  assert.match(customerLanguageHint("Aap ke paas black hoodie hai?"), /Roman Urdu/);
  assert.match(customerLanguageHint("Is there a black hoodie in stock?"), /same language and writing system/);
  assert.match(customerLanguageHint("Please check stock, aap have black?"), /No Urdu-specific signal is dominant/);
});

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  if (String(input) === "https://deverve-turnstile-verify.wastinabeel99.workers.dev") {
    const body = JSON.parse(String(init.body || "{}"));
    return new Response(JSON.stringify({ success: body.token === "test-valid-token" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return nativeFetch(input, init);
};

test("Pages execution context schedules the contact enquiry queue without delaying the response", async () => {
  const scheduled=[];
  const response=await handleRequest(new Request(origin+"/api/health"),env(new FakeD1()),{waitUntil(promise){scheduled.push(promise);}});
  assert.equal(response.status,200);
  assert.equal(scheduled.length,1);
  await Promise.all(scheduled);
});

test("queued contact enquiries are delivered to the configured owner email through Resend", async () => {
  const updates=[];
  const db={
    prepare(sql){
      let values=[];
      return {
        bind(...next){values=next;return this;},
        async first(){return null;},
        async all(){
          assert.match(sql,/FROM enquiry_email_queue q JOIN enquiries e/);
          return {results:[{id:"queue-1",enquiry_id:"enquiry-1",attempts:0,contact_type:"complaint",customer_name:"Test Customer",phone:"+923001234567",email:"customer@example.com",message:"Please call me."}]};
        },
        async run(){updates.push({sql,values});return {success:true,meta:{changes:1}};}
      };
    },
    async batch(){return [];}
  };
  const originalFetch=globalThis.fetch;
  let sentRequest;
  globalThis.fetch=async(input,init={})=>{
    if(String(input)==="https://api.resend.com/emails"){
      sentRequest={url:String(input),body:JSON.parse(String(init.body||"{}"))};
      return new Response(JSON.stringify({id:"resend-message-1"}),{status:200,headers:{"content-type":"application/json"}});
    }
    return originalFetch(input,init);
  };
  try {
    await processEnquiryEmailQueue({DB:db,RESEND_API_KEY:"test-resend-key",RESEND_FROM_EMAIL:"receipts@deverve.example",OWNER_NOTIFICATION_EMAIL:"owner@deverve.example"});
  } finally {
    globalThis.fetch=originalFetch;
  }
  assert.equal(sentRequest?.url,"https://api.resend.com/emails");
  assert.deepEqual(sentRequest?.body.to,["owner@deverve.example"]);
  assert.match(sentRequest?.body.text,/Please call me/);
  assert.equal(updates.length,2);
  assert.match(updates[0].sql,/SET status='processing'/);
  assert.match(updates[1].sql,/SET status='sent'/);
});

test("owner notification outbox uses matching bindings and reclaims stale processing leases", async () => {
  const calls=[];
  const batches=[];
  const db={
    prepare(sql){
      let values=[];
      const statement={
        sql,
        values,
        bind(...next){values=next;statement.values=next;return statement;},
        async first(){
          if(sql.includes("FROM store_settings"))return null;
          if(sql.includes("SELECT order_number FROM orders"))return {order_number:"DV-TEST-001"};
          return null;
        },
        async all(){
          calls.push({kind:"all",sql,values});
          return {results:[{id:"notification-1",order_id:"order-1",rental_request_id:null,template_key:"owner_order_created",attempts:0,created_at:new Date().toISOString()}]};
        },
        async run(){
          calls.push({kind:"run",sql,values});
          return {success:true,meta:{changes:1}};
        }
      };
      return statement;
    },
    async batch(statements){batches.push(statements);return [];}
  };
  const originalFetch=globalThis.fetch;
  let sentRequest;
  globalThis.fetch=async(input,init={})=>{
    if(String(input)==="https://api.resend.com/emails"){
      sentRequest={url:String(input),body:JSON.parse(String(init.body||"{}"))};
      return new Response(JSON.stringify({id:"resend-owner-message-1"}),{status:200,headers:{"content-type":"application/json"}});
    }
    return originalFetch(input,init);
  };
  try{
    await processNotificationOutbox({DB:db,RESEND_API_KEY:"test-resend-key",RESEND_FROM_EMAIL:"receipts@deverve.example",OWNER_NOTIFICATION_EMAIL:"owner@deverve.example"});
  }finally{
    globalThis.fetch=originalFetch;
  }
  const select=calls.find(call=>call.kind==="all");
  const claim=calls.find(call=>call.kind==="run");
  assert.equal(select.values.length,2,"queue SELECT must bind both due and stale-lease timestamps");
  assert.match(select.sql,/status='queued' AND next_attempt_at<=\?/);
  assert.match(select.sql,/status='processing' AND processing_started_at IS NOT NULL AND processing_started_at<=\?/);
  assert.equal(claim.values.length,4,"lease claim must bind claim time, row id, due time and stale time");
  assert.match(claim.sql,/processing_started_at=\?/);
  assert.match(claim.sql,/status='processing'/);
  assert.equal(sentRequest?.body.to[0],"owner@deverve.example");
  assert.equal(batches.length,1);
  assert.match(batches[0][0].sql,/processing_started_at=NULL/);
});

test("owner audit history searches beyond the first page and returns a stable page window", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const recent = new Date().toISOString();
  db.audits.push(
    {id:"audit-1",action:"pos.sale_completed",entity_type:"pos_sale",entity_id:"receipt-001",metadata_json:'{"receipt_number":"DV-001"}',created_at:recent,actor_email:"owner@deverve.example"},
    {id:"audit-2",action:"staff.invited",entity_type:"staff",entity_id:"staff-001",metadata_json:'{"email":"team@example.com"}',created_at:new Date(Date.now()-1000).toISOString(),actor_email:"owner@deverve.example"}
  );
  const response = await handleRequest(new Request(origin+"/api/admin/audit-logs?search=receipt&limit=1&offset=0",{headers:{cookie}}),env(db));
  assert.equal(response.status,200);
  const payload = await response.json();
  assert.equal(payload.events.length,1);
  assert.equal(payload.events[0].id,"audit-1");
  assert.equal(payload.has_more,false);
  assert.equal(payload.offset,0);
});

test("POS receipt outbox sends transactional email invoices and opt-in WhatsApp receipts Cloud API", async () => {
  const queueRows=[
    {id:"email-queue",sale_id:"sale-1",channel:"email",attempts:0},
    {id:"wa-queue",sale_id:"sale-1",channel:"whatsapp",attempts:0}
  ];
  const updates=[],calls=[];
  const sale={id:"sale-1",receipt_number:"DV-20261118-ABC123",customer_name:"Receipt Customer",customer_phone:"+923001234567",customer_email:"buyer@example.com",email_receipt_requested:1,whatsapp_receipt_consent:1,total_paisa:199900,status:"completed"};
  const items=[{product_name_snapshot:"Premium Hoodie",sku_snapshot:"DV-HOOD-M",size_snapshot:"M",color_snapshot:"Black",quantity:1,unit_price_paisa:199900,line_total_paisa:199900}];
  const db={
    prepare(sql){
      let values=[];
      return {
        bind(...next){values=next;return this;},
        async first(){if(sql.includes("FROM pos_sales WHERE id=?"))return sale;return null;},
        async all(){if(sql.includes("FROM pos_receipt_outbox"))return {results:queueRows};if(sql.includes("FROM pos_sale_items"))return {results:items};throw new Error("Unexpected receipt queue query: "+sql);},
        async run(){updates.push({sql,values});return {success:true,meta:{changes:1}};}
      };
    }
  };
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
    const url=String(input),body=JSON.parse(String(init.body||"{}"));
    calls.push({url,body,headers:init.headers});
    if(url==="https://api.resend.com/emails")return new Response(JSON.stringify({id:"resend-receipt-1"}),{status:200,headers:{"content-type":"application/json"}});
    if(url==="https://graph.facebook.com/v27.0/123456789/messages")return new Response(JSON.stringify({messages:[{id:"wamid.receipt-1"}]}),{status:200,headers:{"content-type":"application/json"}});
    throw new Error("Unexpected provider URL: "+url);
  };
  try {
    await processPosReceiptOutbox({
      DB:db,
      RESEND_API_KEY:"test-resend-key",
      RESEND_FROM_EMAIL:"receipts@deverve.example",
      WHATSAPP_ACCESS_TOKEN:"test-whatsapp-token",
      WHATSAPP_PHONE_NUMBER_ID:"123456789",
      WHATSAPP_RECEIPT_TEMPLATE:"deverve_pos_receipt",
      WHATSAPP_RECEIPT_LANGUAGE:"en"
    });
  } finally {
    globalThis.fetch=originalFetch;
  }
  assert.equal(calls.length,2);
  const emailCall=calls.find(call=>call.url==="https://api.resend.com/emails");
  assert.deepEqual(emailCall.body.to,["buyer@example.com"]);
  assert.match(emailCall.body.text,/DV-20261118-ABC123/);
  const whatsappCall=calls.find(call=>call.url.includes("graph.facebook.com"));
  assert.equal(whatsappCall.body.to,"923001234567");
  assert.equal(whatsappCall.body.template.name,"deverve_pos_receipt");
  assert.deepEqual(whatsappCall.body.template.components[0].parameters.map(parameter=>parameter.text),["Receipt Customer","DV-20261118-ABC123","PKR 1999.00"]);
  assert.equal(updates.filter(update=>update.sql.includes("SET status='sent'")).length,2);
});

test("POS receipt outbox never sends a successful-sale receipt after the sale is voided", async () => {
  const queueRows=[{id:"voided-email",sale_id:"sale-voided",channel:"email",attempts:0}];
  const updates=[],calls=[];
  const db={
    prepare(sql){
      let values=[];
      return {
        bind(...next){values=next;return this;},
        async first(){return {id:"sale-voided",status:"voided"};},
        async all(){if(sql.includes("FROM pos_receipt_outbox"))return {results:queueRows};throw new Error("Unexpected query: "+sql);},
        async run(){updates.push({sql,values});return {success:true,meta:{changes:1}};}
      };
    }
  };
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input)=>{calls.push(String(input));throw new Error("Provider must not be called for a voided sale");};
  try {
    await processPosReceiptOutbox({DB:db,RESEND_API_KEY:"test-resend-key",RESEND_FROM_EMAIL:"receipts@deverve.example"});
  } finally {
    globalThis.fetch=originalFetch;
  }
  assert.equal(calls.length,0);
  assert.equal(updates.some(update=>update.sql.includes("last_error_code='sale_not_completed'")),true);
});

test("POS receipt outbox suppresses already-voided receipts even without provider credentials", async () => {
  const queueRows=[{id:"voided-email-unconfigured",sale_id:"sale-voided-unconfigured",channel:"email",attempts:0}];
  const updates=[];
  const db={
    prepare(sql){
      let values=[];
      return {
        bind(...next){values=next;return this;},
        async first(){return {id:"sale-voided-unconfigured",status:"voided"};},
        async all(){if(sql.includes("FROM pos_receipt_outbox"))return {results:queueRows};throw new Error("Unexpected query: "+sql);},
        async run(){updates.push({sql,values});return {success:true,meta:{changes:1}};}
      };
    }
  };
  await processPosReceiptOutbox({DB:db});
  assert.equal(updates.some(update=>update.sql.includes("status='failed'")&&update.values[0]==="voided-email-unconfigured"),true);
});

test("authorized POS staff can retry only failed receipts with recorded customer consent", async () => {
  const db=new FakeD1();
  const setup=await bootstrap(db);
  const cookie=setup.headers.get("set-cookie").split(";")[0];
  const saleId=crypto.randomUUID();
  db.posSales.set(saleId,{status:"completed",customer_email:"buyer@example.com",customer_phone:"+923001234567",email_receipt_requested:1,whatsapp_receipt_consent:1});
  db.posReceiptOutbox.set("failed-email",{id:"failed-email",sale_id:saleId,channel:"email",status:"failed",attempts:5,last_error_code:"resend_http_503"});
  const response=await handleRequest(request("/api/admin/pos/receipts/retry","POST",{sale_id:saleId,channel:"email"},{cookie}),env(db));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{queued:true,channel:"email"});
  assert.equal(db.posReceiptOutbox.get("failed-email").status,"queued");
  assert.equal(db.posReceiptOutbox.get("failed-email").attempts,0);
  assert.equal(db.audits.some(row=>row.action==="pos.receipt_retry_requested"),true);
});

test("authorized POS staff cannot retry receipts for a voided sale", async () => {
  const db=new FakeD1();
  const setup=await bootstrap(db);
  const cookie=setup.headers.get("set-cookie").split(";")[0];
  const saleId=crypto.randomUUID();
  db.posSales.set(saleId,{status:"voided",customer_email:"buyer@example.com",customer_phone:"+923001234567",email_receipt_requested:1,whatsapp_receipt_consent:1});
  db.posReceiptOutbox.set("failed-voided-email",{id:"failed-voided-email",sale_id:saleId,channel:"email",status:"failed",attempts:5,last_error_code:"sale_not_completed"});
  const response=await handleRequest(request("/api/admin/pos/receipts/retry","POST",{sale_id:saleId,channel:"email"},{cookie}),env(db));
  assert.equal(response.status,409);
  assert.equal(db.posReceiptOutbox.get("failed-voided-email").status,"failed");
  assert.equal(db.audits.some(row=>row.action==="pos.receipt_retry_requested"),false);
});

test("same-origin admin writes remain usable when embedded browsers omit Origin and Referer", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const response = await handleRequest(new Request(origin + "/api/admin/products", {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "x-deverve-admin-request": "same-origin" },
    body: JSON.stringify({}),
  }), env(db));
  assert.notEqual(response.status, 403, "trusted same-origin marker should pass origin verification");
  assert.equal(response.status, 400, "invalid product payload should be rejected after origin verification");
});

test("same-origin admin marker survives a forwarded Origin mismatch while cross-site requests remain blocked", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const forwardedOrigin = await handleRequest(new Request(origin + "/api/admin/products", {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: "https://forwarded-origin.example", "sec-fetch-site": "same-origin", "x-deverve-admin-request": "same-origin" },
    body: JSON.stringify({}),
  }), env(db));
  assert.equal(forwardedOrigin.status, 400, "trusted same-origin marker should pass the origin guard before payload validation");

  const forwardedSalesHistory = await handleRequest(new Request(origin + "/api/admin/pos/sales?limit=50", {
    headers: { cookie, origin: "https://forwarded-origin.example", "sec-fetch-site": "same-origin", "x-deverve-admin-request": "same-origin" },
  }), env(db));
  assert.equal(forwardedSalesHistory.status, 200, "same-origin admin GETs should also survive a forwarded Origin mismatch");
  assert.deepEqual((await forwardedSalesHistory.json()).sales, []);

  const crossSite = await handleRequest(new Request(origin + "/api/admin/products", {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: "https://attacker.example", "sec-fetch-site": "cross-site", "x-deverve-admin-request": "same-origin" },
    body: JSON.stringify({}),
  }), env(db));
  assert.equal(crossSite.status, 403, "explicit cross-site fetch metadata must override the marker");
});

test("POS endpoints require an authenticated staff session", async () => {
  const response = await handleRequest(request("/api/admin/pos/bootstrap", "GET"), env(new FakeD1()));
  assert.equal(response.status, 401);
  const refund = await handleRequest(request("/api/admin/pos/sales/00000000-0000-4000-8000-000000000000/void", "POST", {reason:"test"}), env(new FakeD1()));
  assert.equal(refund.status, 401);
});

test("inventory overview requires an authenticated staff session", async () => {
  const response = await handleRequest(request("/api/admin/inventory", "GET"), env(new FakeD1()));
  assert.equal(response.status, 401);
});

test("vehicle gallery management requires an authenticated owner or manager", async () => {
  const vehicleId = crypto.randomUUID();
  const response = await handleRequest(request(`/api/admin/vehicles/${vehicleId}/media`, "GET"), env(new FakeD1()));
  assert.equal(response.status, 401);
});

test("Safepay webhook HMAC-SHA512 verification accepts the exact raw payload and rejects tampering", async () => {
  const raw = '{"token":"evt_123456789012","type":"payment.succeeded","data":{"tracker":"track_123456789012","state":"TRACKER_ENDED","amount":12000,"currency":"PKR"}}';
  const secret = "sandbox-webhook-secret-for-test-only";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const signature = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(await verifySafepaySignature(raw, signature, secret), true);
  assert.equal(await verifySafepaySignature(raw + " ", signature, secret), false);
  assert.equal(await verifySafepaySignature(raw, "invalid", secret), false);
});

test("Safepay webhook is durably queued after signature verification when the Pages Queue binding exists", async () => {
  const db = new FakeD1();
  const raw = JSON.stringify({ token: "evt_queue_123456789012", type: "payment.succeeded", data: { tracker: "track_queue_123456789012", state: "TRACKER_ENDED", amount: 12000, currency: "PKR" } });
  const secret = "sandbox-webhook-secret-for-test-only";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const signature = Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, "0")).join("");
  const sent = [];
  const configured = {
    ...env(db),
    SAFEPAY_ENV: "sandbox",
    SAFEPAY_MERCHANT_API_KEY: "test-public-key",
    SAFEPAY_SECRET_KEY: "test-secret-key",
    SAFEPAY_WEBHOOK_SECRET: secret,
    PAYMENT_WEBHOOK_QUEUE: { async send(message) { sent.push(message); } },
  };
  const response = await handleRequest(new Request(origin + "/api/webhooks/safepay", {
    method: "POST", headers: { "content-type": "application/json", "X-SFPY-SIGNATURE": signature }, body: raw,
  }), configured);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { received: true, queued: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].rawBody, raw);
  assert.equal(sent[0].signature, signature);
  assert.equal(sent[0].eventId, "evt_queue_123456789012");
  assert.equal(sent[0].payloadDigest.length, 43, "event digest uses the existing base64url SHA-256 representation");
  assert.equal(db.paymentWebhookEvents.get("evt_queue_123456789012").processing_status, "received");
  assert.equal(db.paymentAttempts.size, 0, "the Pages request must acknowledge only after durable queue publication, not process payment inline");
});

test("Safepay Queue consumer re-verifies and reconciles a durable queued event exactly once", async () => {
  const db = new FakeD1();
  const orderId = crypto.randomUUID();
  const tracker = "track_consumer_123456789012";
  const eventId = "evt_consumer_123456789012";
  const rawBody = JSON.stringify({ token: eventId, type: "payment.succeeded", data: { tracker, state: "TRACKER_ENDED", amount: 12500, currency: "PKR" } });
  const secret = "sandbox-webhook-secret-for-test-only";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const signature = Array.from(new Uint8Array(signatureBytes), byte => byte.toString(16).padStart(2, "0")).join("");
  const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
  const payloadDigest = btoa(String.fromCharCode(...new Uint8Array(digestBytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
  db.paymentWebhookEvents.set(eventId, { provider_event_id: eventId, payload_sha256: payloadDigest, processing_status: "received" });
  db.orders.set(orderId, { id: orderId, order_number: "DV-QUEUE-CONSUMER", total_paisa: 12500, payment_provider: "safepay", payment_status: "pending", delivery_fee_status: "accepted", order_status: "pending" });
  db.paymentAttempts.set("attempt-queue-consumer", { id: "attempt-queue-consumer", order_id: orderId, provider: "safepay", provider_reference: tracker, amount_paisa: 12500, status: "pending" });
  const consumerEnv = { ...env(db), SAFEPAY_ENV: "sandbox", SAFEPAY_MERCHANT_API_KEY: "test-public-key", SAFEPAY_SECRET_KEY: "test-secret-key", SAFEPAY_WEBHOOK_SECRET: secret };
  await safepayQueueConsumer.queue({ messages: [{ body: { rawBody, signature, eventId, payloadDigest } }] }, consumerEnv);
  assert.equal(db.paymentAttempts.get("attempt-queue-consumer").status, "succeeded");
  assert.equal(db.orders.get(orderId).payment_status, "paid");
  assert.equal(db.financialTransactions.length, 1);
  assert.equal(db.paymentWebhookEvents.get(eventId).processing_status, "processed");
  await assert.rejects(() => safepayQueueConsumer.queue({ messages: [{ body: { rawBody, signature, eventId, payloadDigest: "A".repeat(43) } }] }, consumerEnv), /payload integrity check failed/);
  assert.equal(db.financialTransactions.length, 1, "invalid queued payloads must not mutate the payment ledger");
});

test("Safepay checkout stays unavailable unless all sandbox credentials are configured", async () => {
  const response = await handleRequest(request("/api/storefront/payment-options", "GET"), env(new FakeD1()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { online_payment_available: false, environment: null, methods: [{id:"cod",label:"Cash on delivery",kind:"cod",provider:"",account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"Pay when your order is delivered.",qr_media_id:null}] });
  const webhook = await handleRequest(request("/api/webhooks/safepay", "POST", {}), env(new FakeD1()));
  assert.equal(webhook.status, 503);
});

test("Safepay failed-payment retry can later succeed on the same tracker", async () => {
  const db = new FakeD1();
  const orderId = crypto.randomUUID();
  const tracker = "track_12345678-1234-1234-1234-123456789012";
  db.orders.set(orderId, {
    id: orderId, order_number: "DV-SAFEPAY-RETRY", total_paisa: 12000,
    payment_provider: "safepay", payment_status: "pending",
    delivery_fee_status: "accepted", order_status: "pending",
  });
  db.paymentAttempts.set("attempt-retry", {
    id: "attempt-retry", order_id: orderId, provider: "safepay",
    provider_reference: tracker, amount_paisa: 12000, status: "pending",
  });
  const secret = "sandbox-webhook-secret-for-test-only";
  const send = async (token, type, data) => {
    const raw = JSON.stringify({ token, type, data });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
    const signature = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return handleRequest(new Request(origin + "/api/webhooks/safepay", {
      method: "POST", headers: { "content-type": "application/json", "X-SFPY-SIGNATURE": signature }, body: raw,
    }), { ...env(db), SAFEPAY_ENV: "sandbox", SAFEPAY_MERCHANT_API_KEY: "test-public-key", SAFEPAY_SECRET_KEY: "test-secret-key", SAFEPAY_WEBHOOK_SECRET: secret });
  };
  const failed = await send("evt_failed_1234567890", "payment.failed", { tracker, state: "TRACKER_ENROLLED" });
  assert.equal(failed.status, 200);
  assert.equal(db.paymentAttempts.get("attempt-retry").status, "pending");
  assert.equal(db.orders.get(orderId).payment_status, "pending");

  const succeeded = await send("evt_succeeded_1234567890", "payment.succeeded", { tracker, state: "TRACKER_ENDED", amount: 12000, currency: "PKR" });
  assert.equal(succeeded.status, 200);
  assert.equal(db.paymentAttempts.get("attempt-retry").status, "succeeded");
  assert.equal(db.orders.get(orderId).payment_status, "paid");
  assert.equal(db.financialTransactions.length, 1, "the successful transition must create exactly one gateway ledger row");

  db.paymentWebhookEvents.get("evt_succeeded_1234567890").processing_status = "failed";
  const recoveredRetry = await send("evt_succeeded_1234567890", "payment.succeeded", { tracker, state: "TRACKER_ENDED", amount: 12000, currency: "PKR" });
  assert.equal(recoveredRetry.status, 200);
  assert.deepEqual(await recoveredRetry.json(), { received: true, duplicate: true, reconciled: true }, "a retry after payment/ledger commit must recover event acknowledgement without replaying the ledger");
  assert.equal(db.financialTransactions.length, 1, "reconciliation retry must not duplicate the ledger row");

  const originalLedgerId = db.orders.get(orderId).financial_transaction_id;
  db.financialTransactions = [];
  db.paymentWebhookEvents.get("evt_succeeded_1234567890").processing_status = "failed";
  const ledgerRecovery = await send("evt_succeeded_1234567890", "payment.succeeded", { tracker, state: "TRACKER_ENDED", amount: 12000, currency: "PKR" });
  assert.equal(ledgerRecovery.status, 200, "a paid order with a missing cashbook row must be repairable on a verified provider retry");
  assert.deepEqual(await ledgerRecovery.json(), { received: true, processed: true });
  assert.equal(db.orders.get(orderId).financial_transaction_id, originalLedgerId, "ledger recovery must reuse the already-committed transaction identity");
  assert.equal(db.financialTransactions.length, 1);
  assert.equal(db.financialTransactions[0].id, originalLedgerId);

  const duplicate = await send("evt_succeeded_1234567890", "payment.succeeded", { tracker, state: "TRACKER_ENDED", amount: 12000, currency: "PKR" });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(db.financialTransactions.length, 1, "processed event replay must not duplicate the ledger row");

  const conflictingReplay = await send("evt_succeeded_1234567890", "payment.succeeded", { tracker, state: "TRACKER_ENDED", amount: 12001, currency: "PKR" });
  assert.equal(conflictingReplay.status, 409, "an event ID must never be accepted with a different payload");
  assert.equal(db.financialTransactions.length, 1);
});

test("Safepay ineligible order cannot consume a successful payment attempt", async () => {
  const db = new FakeD1();
  const orderId = crypto.randomUUID();
  const tracker = "track_22345678-1234-1234-1234-123456789012";
  db.orders.set(orderId, {
    id: orderId, order_number: "DV-SAFEPAY-STATE-GUARD", total_paisa: 12000,
    payment_provider: "safepay", payment_status: "pending",
    delivery_fee_status: "accepted", order_status: "cancelled",
  });
  db.paymentAttempts.set("attempt-state-guard", {
    id: "attempt-state-guard", order_id: orderId, provider: "safepay",
    provider_reference: tracker, amount_paisa: 12000, status: "pending",
  });
  const secret = "sandbox-webhook-secret-for-test-only";
  const raw = JSON.stringify({ token: "evt_state_guard_123456", type: "payment.succeeded", data: { tracker, state: "TRACKER_ENDED", amount: 12000, currency: "PKR" } });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const signature = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const response = await handleRequest(new Request(origin + "/api/webhooks/safepay", {
    method: "POST", headers: { "content-type": "application/json", "X-SFPY-SIGNATURE": signature }, body: raw,
  }), { ...env(db), SAFEPAY_ENV: "sandbox", SAFEPAY_MERCHANT_API_KEY: "test-public-key", SAFEPAY_SECRET_KEY: "test-secret-key", SAFEPAY_WEBHOOK_SECRET: secret });
  assert.equal(response.status, 503, "the provider should retry an event that cannot yet be reconciled");
  assert.equal(db.paymentAttempts.get("attempt-state-guard").status, "pending", "an ineligible order must not consume the attempt as succeeded");
  assert.equal(db.orders.get(orderId).payment_status, "pending");
  assert.equal(db.financialTransactions.length, 0, "no ledger entry may be written for an ineligible order");
});

test("exchange-only policy rejects new return submissions without creating refund records", async () => {
  const db = new FakeD1();
  const registered = await handleRequest(request("/api/customer/register", "POST", {
    full_name: "Exchange Policy Customer", phone: "+923001234567", email: "exchange@example.com",
    password: "A-strong-customer-password-2026", turnstile_token: "test-valid-token",
  }, { "cf-connecting-ip": "203.0.113.91", "sec-fetch-site": "same-origin" }), env(db));
  const cookie = registered.headers.get("set-cookie").split(";")[0];
  const customerId = (await registered.json()).customer.id;
  const deliveredOrderId = crypto.randomUUID();
  db.orders.set(deliveredOrderId, { id: deliveredOrderId, customer_id: customerId, order_status: "delivered", updated_at: new Date().toISOString(), order_number: "DV-EXCHANGE-ONLY" });
  const payload = { reason: "size_issue", details: "I need a different size, please guide me.", items: [{ order_item_id: crypto.randomUUID(), quantity: 1 }] };
  const response = await handleRequest(request("/api/customer/orders/" + deliveredOrderId + "/returns", "POST", payload, { cookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(response.status, 410);
  assert.match((await response.json()).error, /exchanges only/i);
  assert.equal(db.returnRequests.size, 0);
});

test("return requests can only be refunded after approval and receipt with a manual refund reference", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const orderId = crypto.randomUUID(), customerId = crypto.randomUUID(), returnId = crypto.randomUUID();
  db.orders.set(orderId, { id: orderId, order_number: "DV-RETURN-002" });
  db.customers.set(customerId, { id: customerId, full_name: "Refund Customer", email: "refund@example.com", phone: "+923001234567" });
  db.returnRequests.set(returnId, { id: returnId, order_id: orderId, customer_id: customerId, return_number: "DV-RET-TEST", status: "requested", refund_amount_paisa: 125000, refund_method: null, refund_reference: null, admin_note: "" });
  const early = await handleRequest(request("/api/admin/returns/" + returnId, "PATCH", { status: "refunded", refund_method: "bank_transfer", refund_reference: "BANK-12345" }, headers), env(db));
  assert.equal(early.status, 409);
  const approved = await handleRequest(request("/api/admin/returns/" + returnId, "PATCH", { status: "approved", admin_note: "Return approved." }, headers), env(db));
  assert.equal(approved.status, 200);
  const received = await handleRequest(request("/api/admin/returns/" + returnId, "PATCH", { status: "received", admin_note: "Items received for inspection." }, headers), env(db));
  assert.equal(received.status, 200);
  const missingReference = await handleRequest(request("/api/admin/returns/" + returnId, "PATCH", { status: "refunded", refund_method: "bank_transfer" }, headers), env(db));
  assert.equal(missingReference.status, 400);
  const refunded = await handleRequest(request("/api/admin/returns/" + returnId, "PATCH", { status: "refunded", refund_method: "bank_transfer", refund_reference: "BANK-12345", admin_note: "Manual transfer completed." }, headers), env(db));
  assert.equal(refunded.status, 200);
  assert.equal(db.returnRequests.get(returnId).status, "refunded");
  assert.equal(db.returnRequests.get(returnId).refund_reference, "BANK-12345");
  assert.equal(db.returnStatusEvents.length, 3);
});

test("rental datetime-local values use Pakistan UTC+05:00 and reject invalid wall-clock dates", () => {
  assert.equal(parseRentalDateTime("2026-11-15T10:30"), Date.parse("2026-11-15T05:30:00.000Z"));
  assert.equal(parseRentalDateTime("2026-11-15T10:30:45"), Date.parse("2026-11-15T05:30:45.000Z"));
  assert.equal(parseRentalDateTime("2026-11-15T05:30:00Z"), Date.parse("2026-11-15T05:30:00.000Z"));
  assert.equal(Number.isNaN(parseRentalDateTime("2026-02-30T10:30")), true);
  assert.equal(Number.isNaN(parseRentalDateTime("2026-11-15 10:30")), true);
});
test("public enquiry submissions reject missing or invalid Turnstile tokens", async () => {
  const db = new FakeD1();
  const response = await handleRequest(request("/api/enquiries", "POST", {
    enquiryType: "general", name: "Test Customer", phone: "+923001234567",
    message: "Please contact me.", turnstile_token: "invalid-token",
  }), env(db));
  assert.equal(response.status, 403);
  assert.equal(db.enquiries.size, 0);
});

test("public enquiry submissions accept complaint, DMCA and other important contact types", async () => {
  const db = new FakeD1();
  for (const contactType of ["complaint","dmca","legal","business","other"]) {
    const response = await handleRequest(request("/api/enquiries", "POST", {
      enquiryType: contactType, name: "Test Customer", phone: "+923001234567",
      email: "customer@example.com", message: "Please review this important enquiry.",
    }), env(db));
    assert.equal(response.status, 201);
    const saved = [...db.enquiries.values()].at(-1);
    assert.equal(saved.contact_type, contactType);
    assert.equal(saved.enquiry_type, "general");
  }
  const invalid = await handleRequest(request("/api/enquiries", "POST", {
    enquiryType: "unknown", name: "Test Customer", phone: "+923001234567",
    message: "This type should be rejected.",
  }), env(db));
  assert.equal(invalid.status, 400);
});

test("public enquiry submissions are rate-limited per client IP with retry guidance", async () => {
  const db = new FakeD1();
  const submit = (ip) => handleRequest(request("/api/enquiries", "POST", {
    enquiryType: "general", name: "Test Customer", phone: "+923001234567",
    email: "customer@example.com", message: "Please contact me about your products.",
  }, { "cf-connecting-ip": ip }), env(db));
  for (let index = 0; index < 8; index += 1) {
    const response = await submit("203.0.113.9");
    assert.equal(response.status, 201);
  }
  const limited = await submit("203.0.113.9");
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(db.enquiries.size, 8);
  const separateClient = await submit("203.0.113.10");
  assert.equal(separateClient.status, 201);
  assert.equal(db.enquiries.size, 9);
  assert.equal([...db.rateLimits.keys()].every((key) => key.length === 43 && !key.includes("203.0.113.")), true);
});

test("checkout honeypot accepts bot-shaped requests without creating orders", async () => {
  const db = new FakeD1();
  const response = await handleRequest(request("/api/orders", "POST", {
    website: "https://spam.example",
    customer_name: "Automated Bot",
    phone: "+923001234567",
    delivery_address: "Bot address",
    city: "Jhelum",
    items: [],
  }, { "cf-connecting-ip": "203.0.113.11" }), env(db));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(db.orders.size, 0);
  assert.equal(db.orderItems.length, 0);
});

test("delivery fee must be customer-approved before dispatch and acceptance preserves the COD order", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const adminHeaders = { cookie, "sec-fetch-site": "same-origin" };
  const orderId = crypto.randomUUID();
  const variantId = crypto.randomUUID();
  db.variants.set(variantId, { id: variantId, stock_on_hand: 5, reserved_quantity: 1, is_active: 1 });
  db.orders.set(orderId, {
    id: orderId, order_number: "DV-TEST-DELIVERY", customer_name: "Delivery Customer",
    phone: "+923001234567", email: null, delivery_address: "House 10, Main Road",
    city: "Jhelum", subtotal_paisa: 500000, delivery_fee_paisa: 0, total_paisa: 500000,
    payment_method: "cod", payment_status: "pending", order_status: "pending",
    delivery_fee_status: "pending_quote", delivery_fee_token_hash: null,
    delivery_fee_expires_at: null, customer_note: "", created_at: new Date().toISOString(),
  });
  db.orderItems.push({ id: crypto.randomUUID(), order_id: orderId, variant_id: variantId, quantity: 1 });
  const quote = await handleRequest(request("/api/admin/orders/" + orderId + "/delivery-fee", "POST", { delivery_fee_paisa: 15000 }, adminHeaders), env(db));
  assert.equal(quote.status, 200);
  const quoteBody = await quote.json();
  assert.equal(quoteBody.total_paisa, 515000);
  const token = new URL(quoteBody.approval_url).searchParams.get("token");
  assert.ok(token);
  const preview = await handleRequest(new Request(origin + "/api/delivery-fee/" + token, { headers: { "cf-connecting-ip": "203.0.113.55" } }), env(db));
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).order.delivery_fee_paisa, 15000);
  await handleRequest(request("/api/admin/orders/" + orderId, "PATCH", { order_status: "confirmed" }, adminHeaders), env(db));
  const processingBlocked = await handleRequest(request("/api/admin/orders/" + orderId, "PATCH", { order_status: "processing" }, adminHeaders), env(db));
  assert.equal(processingBlocked.status, 409);
  const accepted = await handleRequest(request("/api/delivery-fee/" + token, "POST", { decision: "accept" }, { "cf-connecting-ip": "203.0.113.55" }), env(db));
  assert.equal(accepted.status, 200);
  assert.equal(db.orders.get(orderId).delivery_fee_status, "accepted");
  assert.equal(db.audits.some((entry) => entry.action === "order.delivery_fee_accepted"), true);
  const processing = await handleRequest(request("/api/admin/orders/" + orderId, "PATCH", { order_status: "processing" }, adminHeaders), env(db));
  assert.equal(processing.status, 200);
  const dispatched = await handleRequest(request("/api/admin/orders/" + orderId, "PATCH", { order_status: "dispatched" }, adminHeaders), env(db));
  assert.equal(dispatched.status, 200);
  assert.equal(db.variants.get(variantId).stock_on_hand, 4);
  assert.equal(db.variants.get(variantId).reserved_quantity, 0);
});

test("declining a delivery quotation cancels the COD order and releases reserved stock", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const adminHeaders = { cookie, "sec-fetch-site": "same-origin" };
  const orderId = crypto.randomUUID();
  const variantId = crypto.randomUUID();
  const token = "test-delivery-approval-token-0123456789abcdef";
  const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hashText = btoa(String.fromCharCode(...new Uint8Array(tokenHash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  db.variants.set(variantId, { id: variantId, stock_on_hand: 5, reserved_quantity: 2, is_active: 1 });
  db.orders.set(orderId, {
    id: orderId, order_number: "DV-TEST-DECLINE", customer_name: "Declining Customer",
    phone: "+923001234567", email: null, delivery_address: "House 10, Main Road",
    city: "Jhelum", subtotal_paisa: 500000, delivery_fee_paisa: 15000, total_paisa: 515000,
    payment_method: "cod", payment_status: "pending", order_status: "pending",
    delivery_fee_status: "awaiting_customer", delivery_fee_token_hash: hashText,
    delivery_fee_expires_at: new Date(Date.now() + 3600000).toISOString(), customer_note: "",
    created_at: new Date().toISOString(),
  });
  db.orderItems.push({ id: crypto.randomUUID(), order_id: orderId, variant_id: variantId, quantity: 2 });
  db.orderItems.push({ id: crypto.randomUUID(), order_id: orderId, variant_id: variantId, quantity: 1 });
  db.orderInventoryReservations.set(orderId + ":" + variantId, { id: crypto.randomUUID(), order_id: orderId, variant_id: variantId, quantity: 3, status: "reserved", payment_provider: "manual", payment_reference: null, reserved_at: new Date().toISOString(), released_at: null, consumed_at: null, updated_at: new Date().toISOString() });
  const insufficient = await handleRequest(request("/api/delivery-fee/" + token, "POST", { decision: "decline" }, { "cf-connecting-ip": "203.0.113.56" }), env(db));
  assert.equal(insufficient.status, 409, "decline must not release stock when duplicate lines exceed the reservation");
  assert.equal(db.orders.get(orderId).order_status, "pending");
  assert.equal(db.variants.get(variantId).reserved_quantity, 2);
  db.variants.get(variantId).reserved_quantity = 3;
  const declined = await handleRequest(request("/api/delivery-fee/" + token, "POST", { decision: "decline" }, { "cf-connecting-ip": "203.0.113.56" }), env(db));
  assert.equal(declined.status, 200);
  assert.equal(db.orders.get(orderId).order_status, "cancelled");
  assert.equal(db.orders.get(orderId).delivery_fee_status, "declined");
  assert.equal(db.audits.some((entry) => entry.action === "order.delivery_fee_declined"), true);
  assert.equal(db.variants.get(variantId).reserved_quantity, 0);
  assert.equal(db.orderInventoryReservations.get(orderId + ":" + variantId).status, "released");
  const repeat = await handleRequest(request("/api/delivery-fee/" + token, "POST", { decision: "accept" }, { "cf-connecting-ip": "203.0.113.56" }), env(db));
  assert.equal(repeat.status, 410);
});

test("rental settings always require CNIC uploads even when the legacy setting is false", async () => {
  const db = new FakeD1();
  db.storeSettings.set("cnic_uploads_enabled", { setting_value_json: "false" });
  const response = await handleRequest(request("/api/rentals/settings", "GET"), env(db));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { cnic_uploads_enabled: true });
});

test("owner cannot disable mandatory CNIC evidence through website settings", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const response = await handleRequest(request("/api/admin/settings", "PATCH", { cnic_uploads_enabled: false }, { cookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /mandatory/i);
});

test("POS cashier capability is separate from the viewer role and cannot access other admin APIs", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const ownerId = [...db.admins.keys()][0];
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const owner = db.admins.get(ownerId);
  owner.role = "viewer";
  db.posCashiers.set(ownerId,{revoked_at:null});
  const me = await handleRequest(new Request(origin + "/api/admin/me", {headers:{cookie}}),env(db));
  assert.equal(me.status,200);
  assert.equal((await me.json()).admin.can_use_pos,true);
  const settings = await handleRequest(request("/api/admin/settings","GET",undefined,{cookie}),env(db));
  assert.equal(settings.status,403);
  assert.match((await settings.json()).error,/restricted to the point-of-sale/i);
  const reports = await handleRequest(request("/api/admin/pos/summary","GET",undefined,{cookie}),env(db));
  assert.equal(reports.status,403);
  assert.match((await reports.json()).error,/cashier access is limited/i);
  db.posCashiers.get(ownerId).revoked_at = new Date().toISOString();
  const revoked = await handleRequest(new Request(origin + "/api/admin/me", {headers:{cookie}}),env(db));
  assert.equal(revoked.status,200);
  assert.equal((await revoked.json()).admin.can_use_pos,false);
});

test("private media library and file previews are unavailable to read-only staff", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  [...db.admins.values()][0].role = "viewer";
  const library = await handleRequest(request("/api/admin/media", "GET", undefined, { cookie }), env(db));
  const file = await handleRequest(request("/api/admin/media/" + crypto.randomUUID() + "/file", "GET", undefined, { cookie }), env(db));
  assert.equal(library.status, 403);
  assert.equal(file.status, 403);
});


test("customer registration creates a secure session and stores a password hash", async () => {
  const db = new FakeD1();
  const response = await handleRequest(request("/api/customer/register", "POST", {
    full_name: "Test Customer", phone: "+923001234567", email: "customer@example.com",
    password: "A-strong-customer-password-2026", turnstile_token: "test-valid-token",
  }, { "cf-connecting-ip": "203.0.113.80", "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /__Host-deverve_customer=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(db.customers.size, 1);
  assert.equal(db.customerSessions.size, 1);
  assert.notEqual([...db.customers.values()][0].password_hash, "A-strong-customer-password-2026");
  assert.equal([...db.customers.values()][0].email_verified_at, null);
  const duplicate = await handleRequest(request("/api/customer/register", "POST", {
    full_name: "Test Customer", phone: "+923001234567", email: "customer@example.com",
    password: "A-strong-customer-password-2026", turnstile_token: "test-valid-token",
  }, { "cf-connecting-ip": "203.0.113.81", "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(duplicate.status, 409);
  assert.equal(db.customers.size, 1);
});

test("customer sign-in, profile update, password change and logout are session protected", async () => {
  const db = new FakeD1();
  await handleRequest(request("/api/customer/register", "POST", {
    full_name: "Test Customer", phone: "+923001234567", email: "customer@example.com",
    password: "A-strong-customer-password-2026", turnstile_token: "test-valid-token",
  }, { "cf-connecting-ip": "203.0.113.82", "sec-fetch-site": "same-origin" }), env(db));
  const signedIn = await handleRequest(request("/api/customer/login", "POST", {
    email: "customer@example.com", password: "A-strong-customer-password-2026",
  }, { "cf-connecting-ip": "203.0.113.82", "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get("set-cookie").split(";")[0];
  const me = await handleRequest(new Request(origin + "/api/customer/me", { headers: { cookie } }), env(db));
  assert.equal(me.status, 200);
  assert.equal((await me.json()).customer.email, "customer@example.com");
  const updated = await handleRequest(request("/api/customer/profile", "PATCH", {
    full_name: "Updated Customer", phone: "+923001234568",
  }, { cookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(updated.status, 200);
  assert.equal(db.customers.values().next().value.full_name, "Updated Customer");
  const passwordChanged = await handleRequest(request("/api/customer/password", "PATCH", {
    current_password: "A-strong-customer-password-2026", new_password: "Another-strong-password-2026",
  }, { cookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(passwordChanged.status, 200);
  const signedOut = await handleRequest(request("/api/customer/logout", "POST", {}, { cookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(signedOut.status, 200);
  assert.equal((await handleRequest(new Request(origin + "/api/customer/me", { headers: { cookie } }), env(db))).status, 401);
});

test("customer order history only returns orders owned by the authenticated account", async () => {
  const db = new FakeD1();
  const first = await handleRequest(request("/api/customer/register", "POST", {
    full_name: "First Customer", phone: "+923001234567", email: "first@example.com",
    password: "A-strong-customer-password-2026", turnstile_token: "test-valid-token",
  }, { "cf-connecting-ip": "203.0.113.83", "sec-fetch-site": "same-origin" }), env(db));
  const second = await handleRequest(request("/api/customer/register", "POST", {
    full_name: "Second Customer", phone: "+923001234568", email: "second@example.com",
    password: "A-strong-customer-password-2026", turnstile_token: "test-valid-token",
  }, { "cf-connecting-ip": "203.0.113.84", "sec-fetch-site": "same-origin" }), env(db));
  const firstId = (await first.json()).customer.id;
  const secondId = (await second.json()).customer.id;
  db.orders.set("order-first", { id: "order-first", customer_id: firstId, order_number: "DV-OWNED-001", city: "Jhelum", subtotal_paisa: 10000, delivery_fee_paisa: 0, total_paisa: 10000, payment_method: "cod", payment_status: "pending", order_status: "pending", delivery_fee_status: "pending_quote", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  db.orderStatusEvents.push({ id: "event-first", order_id: "order-first", from_status: null, to_status: "pending", actor_type: "system", note: "Order received", created_at: new Date().toISOString() });
  const firstCookie = first.headers.get("set-cookie").split(";")[0];
  const secondCookie = second.headers.get("set-cookie").split(";")[0];
  const firstOrders = await handleRequest(new Request(origin + "/api/customer/orders", { headers: { cookie: firstCookie } }), env(db));
  const secondOrders = await handleRequest(new Request(origin + "/api/customer/orders", { headers: { cookie: secondCookie } }), env(db));
  const firstPayload = await firstOrders.json();
  const secondPayload = await secondOrders.json();
  assert.equal(firstPayload.orders.length, 1);
  assert.equal(firstPayload.orders[0].events.length, 1);
  assert.equal(secondPayload.orders.length, 0);
  assert.notEqual(firstId, secondId);
});

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, " ").trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    const q = this.sql;
    const v = this.values;
    if (q.startsWith("SELECT status,customer_phone,customer_email,email_receipt_requested,whatsapp_receipt_consent FROM pos_sales WHERE id=?")) return this.db.posSales.get(v[0]) ?? null;
    if (q.startsWith("SELECT id FROM pos_receipt_outbox WHERE sale_id=? AND channel=? AND status='failed'")) return [...this.db.posReceiptOutbox.values()].find(row=>row.sale_id===v[0]&&row.channel===v[1]&&row.status==="failed")??null;
    if (q.startsWith("SELECT id FROM ai_provider_keys WHERE key_fingerprint")) return [...this.db.aiKeys.values()].find((row) => row.key_fingerprint === v[0]) ?? null;
    if (q.startsWith("SELECT s.id, s.customer_id")) {
      const session = [...this.db.customerSessions.values()].find((item) => item.token_hash === v[0] && !item.revoked_at && item.expires_at > v[1]);
      const customer = session && this.db.customers.get(session.customer_id);
      return customer?.status === "active" ? { id: session.id, customer_id: customer.id, email: customer.email, full_name: customer.full_name, phone: customer.phone, status: customer.status, expires_at: session.expires_at, revoked_at: session.revoked_at } : null;
    }
    if (q.startsWith("SELECT COUNT(*) AS document_count FROM rental_documents")) return { document_count: [...this.db.rentalDocuments.values()].filter((item) => item.rental_request_id === v[0] && ["cnic_front","cnic_back"].includes(item.document_side)).length };
    if (q.startsWith("SELECT object_key, mime_type, document_side FROM rental_documents")) return [...this.db.rentalDocuments.values()].find(item => item.rental_request_id === v[0] && item.document_side === v[1]) ?? null;
    if (q.startsWith("SELECT id, daily_rate_paisa, with_driver_daily_rate_paisa FROM vehicles")) return this.db.vehicles.get(v[0]) ?? null;
    if (q.startsWith("SELECT EXISTS (SELECT 1 FROM admin_pos_cashiers WHERE admin_user_id=? AND revoked_at IS NULL) AS can_use_pos")) return {can_use_pos:this.db.posCashiers.has(v[0]) && this.db.posCashiers.get(v[0])?.revoked_at == null ? 1 : 0};
    if (q.startsWith("SELECT id, email, password_hash, full_name, phone, status FROM customers")) return [...this.db.customers.values()].find((item) => item.email.toLowerCase() === String(v[0]).toLowerCase()) ?? null;
    if (q.startsWith("SELECT password_hash FROM customers")) { const row = this.db.customers.get(v[0]); return row ? { password_hash: row.password_hash } : null; }
    if (q.startsWith("SELECT setting_value_json FROM store_settings WHERE setting_key")) { const key=q.match(/setting_key\s*=\s*'([^']+)'/i)?.[1]??v[0]; return this.db.storeSettings.get(key) ?? null; }
    if (q.startsWith("SELECT id, order_status, subtotal_paisa FROM orders WHERE id = ?")) return this.db.orders.get(v[0]) ?? null;
    if (q.startsWith("SELECT payment_status, financial_transaction_id, total_paisa FROM orders WHERE id = ?")) return this.db.orders.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, amount_paisa FROM financial_transactions WHERE id = ? AND reference_type = 'order'")) return this.db.financialTransactions.find((row) => row.id === v[0] && row.reference_id === v[1]) ?? null;
    if (q.startsWith("SELECT order_number, total_paisa, order_status FROM orders WHERE source_quote_id = ?")) {
      const row = [...this.db.orders.values()].find((order) => order.source_quote_id === v[0]);
      return row ? { order_number: row.order_number, total_paisa: row.total_paisa, order_status: row.order_status } : null;
    }
    if (q.startsWith("SELECT id,order_number,payment_method,payment_provider,payment_status,order_status,total_paisa,financial_transaction_id FROM orders WHERE id=?")) return this.db.orders.get(v[0]) ?? null;
    if (q.startsWith("SELECT id,name,kind FROM financial_accounts WHERE id=? AND is_active=1")) return this.db.financialAccounts.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, name, kind FROM financial_accounts WHERE id=? AND is_active=1")) return this.db.financialAccounts.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, order_status, payment_provider, payment_status FROM orders WHERE id = ?")) return this.db.orders.get(v[0]) ?? null;
    if (q.startsWith("SELECT id FROM payment_attempts WHERE order_id = ? AND provider = 'safepay'")) return [...this.db.paymentAttempts.values()].find((item) => item.order_id === v[0] && item.provider === "safepay" && ["created", "pending", "succeeded"].includes(item.status)) ?? null;
    if (q.startsWith("SELECT id, order_number, order_status, updated_at FROM orders WHERE id = ? AND customer_id = ?")) { const row = this.db.orders.get(v[0]); return row?.customer_id === v[1] ? row : null; }
    if (q.startsWith("SELECT id,event_type,title,body,entity_type,entity_id,is_read,created_at,read_at FROM owner_notifications")) return { success: true, results: [...this.db.notifications.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100) };
    if (q.startsWith("SELECT id, quantity, unit_price_paisa FROM order_items WHERE order_id = ? AND id IN")) { const ids = new Set(v.slice(1)); return null; }
    if (q.startsWith("SELECT id, order_id, status, refund_amount_paisa FROM return_requests WHERE id = ?")) return this.db.returnRequests.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, status, admin_note FROM return_requests WHERE id = ?")) return this.db.returnRequests.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, status, admin_note FROM exchange_requests WHERE id = ?")) return this.db.exchangeRequests.get(v[0]) ?? null;
    if (q.startsWith("SELECT processing_status, payload_sha256 FROM payment_webhook_events WHERE provider = 'safepay'")) return this.db.paymentWebhookEvents.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, order_id, amount_paisa, status FROM payment_attempts WHERE provider = 'safepay'")) return [...this.db.paymentAttempts.values()].find((item) => item.provider_reference === v[0]) ?? null;
    if (q.startsWith("SELECT order_number, customer_name, subtotal_paisa, delivery_fee_paisa, total_paisa, delivery_fee_expires_at FROM orders WHERE delivery_fee_token_hash")) {
      const row = [...this.db.orders.values()].find((item) => item.delivery_fee_token_hash === v[0] && item.delivery_fee_status === "awaiting_customer" && item.delivery_fee_expires_at > v[1] && ["pending", "confirmed"].includes(item.order_status));
      return row ?? null;
    }
    if (q.startsWith("SELECT id, order_status FROM orders WHERE delivery_fee_token_hash")) {
      const row = [...this.db.orders.values()].find((item) => item.delivery_fee_token_hash === v[0] && item.delivery_fee_status === "awaiting_customer" && item.delivery_fee_expires_at > v[1] && ["pending", "confirmed"].includes(item.order_status));
      return row ? { id: row.id, order_status: row.order_status } : null;
    }
    if (q.startsWith("INSERT INTO public_rate_limits")) {
      const [key, windowStart, expiresAt] = v;
      const previous = this.db.rateLimits.get(key);
      const count = previous && previous.window_start === windowStart ? previous.request_count + 1 : 1;
      this.db.rateLimits.set(key, { window_start: windowStart, request_count: count, expires_at: expiresAt });
      return { request_count: count };
    }
    if (q.startsWith("SELECT COUNT(*) AS total FROM owner_notifications")) return { total: [...this.db.notifications.values()].filter((row) => row.is_read === 0).length };
    if (q.startsWith("SELECT s.id, s.admin_user_id")) {
      const session = [...this.db.sessions.values()].find((item) => item.token_hash === v[0] && !item.revoked_at && item.expires_at > v[1]);
      const admin = session && this.db.admins.get(session.admin_user_id);
      return admin?.is_active ? { id: session.id, admin_user_id: admin.id, email: admin.email, role: admin.role, is_active: admin.is_active, expires_at: session.expires_at, revoked_at: session.revoked_at, can_use_pos: this.db.posCashiers.get(admin.id)?.revoked_at == null && this.db.posCashiers.has(admin.id) ? 1 : 0 } : null;
    }
    if (q.startsWith("SELECT v.id, v.product_id, v.sku, v.size, v.color, v.stock_on_hand, v.reserved_quantity, v.cost_price_paisa, p.name, p.wholesale_price_paisa")) {
      const variant = this.db.variants.get(v[0]); const product = variant && this.db.products.get(variant.product_id);
      return variant && product ? { ...variant, reserved_quantity: variant.reserved_quantity ?? 0, name: product.name, wholesale_price_paisa: product.wholesale_price_paisa, retail_price_paisa: product.retail_price_paisa } : null;
    }
    if (q.startsWith("SELECT id, status FROM vehicles WHERE id = ?")) { const row = this.db.vehicles.get(v[0]); return row ? { id: row.id, status: row.status } : null; }
    if (q.startsWith("SELECT COUNT(*) AS count FROM rental_requests WHERE vehicle_id = ? AND status IN")) return { count: [...this.db.rentalRequests.values()].filter(row => row.vehicle_id === v[0] && ["requested","reviewing","confirmed","active"].includes(row.status)).length };
    if (q.startsWith("SELECT id, vehicle_id, pickup_at, return_at, status, admin_note FROM rental_requests WHERE id = ?") || q.startsWith("SELECT id, vehicle_id, pickup_at, return_at, status FROM rental_requests WHERE id = ?")) return this.db.rentalRequests.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, status, valid_until, approval_token FROM wholesale_quotes WHERE id = ?")) return this.db.wholesaleQuotes.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, business_name, contact_name, phone, email, delivery_address, requested_items, quoted_total_paisa, status, valid_until, city, approval_token, converted_order_id FROM wholesale_quotes WHERE approval_token = ?")) return [...this.db.wholesaleQuotes.values()].find((row) => row.approval_token === v[0]) ?? null;
    if (q.startsWith("SELECT order_number, total_paisa, order_status, payment_provider FROM orders WHERE checkout_token")) {
      return [...this.db.orders.values()].find((row) => row.checkout_token === v[0]) ?? null;
    }
    if (q.startsWith("SELECT v.id, v.product_id, v.sku, v.size, v.color, v.stock_on_hand, v.reserved_quantity, v.cost_price_paisa, p.name, p.retail_price_paisa")) {
      const variant = this.db.variants.get(v[0]);
      const product = variant && this.db.products.get(variant.product_id);
      return variant && product ? { ...variant, reserved_quantity: variant.reserved_quantity ?? 0, name: product.name, retail_price_paisa: product.retail_price_paisa } : null;
    }
    if (q.startsWith("SELECT order_number, total_paisa, order_status FROM orders WHERE source_quote_id = ?")) {
      const row = [...this.db.orders.values()].find((item) => item.source_quote_id === v[0]);
      return row ? { order_number: row.order_number, total_paisa: row.total_paisa, order_status: row.order_status } : null;
    }
    if (q.startsWith("SELECT order_number, total_paisa, order_status FROM orders WHERE id = ?")) { const row = [...this.db.orders.values()].find((item) => item.id === v[0]); return row ?? null; }
    if (q.startsWith("SELECT id, order_status, subtotal_paisa, discount_amount_paisa, free_delivery FROM orders WHERE id = ?")) return this.db.orders.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, order_status FROM orders WHERE id = ?")) return this.db.orders.get(v[0]) ?? null;
    if (q.startsWith("SELECT object_key,mime_type,byte_size,status,uploaded_by,updated_at FROM media_assets WHERE id=?")) return this.db.mediaAssets.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, email, role, is_active, password_hash FROM admin_users")) {
      return [...this.db.admins.values()].find((item) => item.email.toLowerCase() === String(v[0]).toLowerCase()) ?? null;
    }
    if (q.startsWith("SELECT failure_count, locked_until")) return this.db.attempts.get(v[0]) ?? null;
    if (q.startsWith("SELECT locked_until")) return this.db.attempts.get(v[0]) ?? null;
    if (q.startsWith("SELECT id FROM products WHERE slug = ?")) {
      return [...this.db.products.values()].find((item) => item.slug === v[0] && (!v[1] || item.id !== v[1])) ?? null;
    }
    if (q.startsWith("SELECT id, status FROM enquiries WHERE id = ?")) return this.db.enquiries.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, COALESCE(contact_type, enquiry_type) AS enquiry_type, customer_name, phone, email, message, status, source, created_at FROM enquiries WHERE id = ?")) { const row=this.db.enquiries.get(v[0]); return row?{...row,enquiry_type:row.contact_type||row.enquiry_type}:null; }
    if (q.startsWith("SELECT id, status FROM products WHERE id = ?")) { const row = this.db.products.get(v[0]); return row ? { id: row.id, status: row.status } : null; }
    if (q.startsWith("SELECT id, product_id, sku, size, color, stock_on_hand, reserved_quantity, barcode, cost_price_paisa, reorder_level, is_active, created_at, updated_at FROM product_variants WHERE id = ?")) return this.db.variants.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, product_id, sku, size, color, stock_on_hand, is_active, created_at, updated_at FROM product_variants WHERE id = ?")) return this.db.variants.get(v[0]) ?? null;
    if (q.startsWith("SELECT id, stock_on_hand, is_active FROM product_variants WHERE id = ?")) { const row = this.db.variants.get(v[0]); return row ? { id: row.id, stock_on_hand: row.stock_on_hand, is_active: row.is_active } : null; }
    if (q.startsWith("SELECT id FROM product_variants WHERE id = ?")) { const row = this.db.variants.get(v[0]); return row ? { id: row.id } : null; }
    if (q.startsWith("SELECT id, slug, name, description, category, audience, status")) return this.db.products.get(v[0]) ?? null;
    if (q.startsWith("SELECT id FROM products WHERE id = ?")) return this.db.products.get(v[0]) ?? null;
    if (q.startsWith("SELECT (SELECT COUNT(*)")) return { published_products: 0, draft_products: this.db.products.size, new_enquiries: 0, pending_orders: 0, rental_requests: 0 };
    if (q.startsWith("SELECT 1 AS ok")) return { ok: 1 };
    if (q.startsWith("SELECT 1 AS connected")) return { connected: 1 };
    throw new Error("Unexpected first query: " + q);
  }
  async all() {
    const q = this.sql;
    const v = this.values;
    if (q.startsWith("SELECT variant_id, quantity FROM order_items WHERE order_id = ?")) return { results: this.db.orderItems.filter(item => item.order_id === v[0]).map(item => ({ variant_id: item.variant_id, quantity: item.quantity })) };
    if (q.startsWith("SELECT s.id, s.receipt_number, s.customer_name, s.customer_phone, s.subtotal_paisa")) return { success: true, results: [] };
    if (q.startsWith("SELECT l.id, l.action, l.entity_type, l.entity_id, l.metadata_json, l.created_at, u.email AS actor_email FROM audit_logs")) {
      const [search, pattern, limit, offset] = v;
      const matches = this.db.audits.filter(row => !search || [row.action,row.entity_type,row.entity_id,row.metadata_json,row.actor_email].join(" ").toLowerCase().includes(String(search).toLowerCase()));
      return {success:true,results:matches.slice(offset,offset+limit)};
    }
    if (q.startsWith("SELECT v.id, v.name, v.vehicle_type, v.transmission, v.seats, v.fuel_type, v.daily_rate_paisa, v.with_driver_daily_rate_paisa, v.image_key, v.description, vm.media_asset_id")) {
      return { success: true, results: [...this.db.vehicles.values()].filter((vehicle) => vehicle.status === "available").map((vehicle) => ({ ...vehicle, media_asset_id: null, media_alt_text: null, media_position: null, media_is_primary: null })) };
    }
    if (q.startsWith("SELECT id,event_type,title,body,entity_type,entity_id,is_read,created_at,read_at FROM owner_notifications")) return { success: true, results: [...this.db.notifications.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100) };
    if (q.startsWith("SELECT id, quantity, unit_price_paisa FROM order_items WHERE order_id = ? AND id IN")) {
      const ids = new Set(v.slice(1));
      return { success: true, results: this.db.orderItems.filter((row) => row.order_id === v[0] && ids.has(row.id)) };
    }
    if (q.startsWith("SELECT r.id, r.order_id, r.return_number, r.reason, r.details, r.status, r.refund_amount_paisa, r.refund_method, r.refund_reference, r.admin_note, r.created_at, r.updated_at, o.order_number FROM return_requests r")) {
      const rows = [...this.db.returnRequests.values()].filter((row) => row.customer_id === v[0]).map((row) => ({ ...row, order_number: this.db.orders.get(row.order_id)?.order_number }));
      return { success: true, results: rows };
    }
    if (q.startsWith("SELECT ri.id, ri.return_request_id, ri.order_item_id, ri.quantity, ri.unit_refund_paisa, oi.product_name_snapshot")) {
      const ids = new Set(v); return { success: true, results: this.db.returnRequestItems.filter((row) => ids.has(row.return_request_id)).map((row) => { const item = this.db.orderItems.find((entry) => entry.id === row.order_item_id) ?? {}; return { ...row, product_name_snapshot: item.product_name_snapshot, sku_snapshot: item.sku_snapshot, size_snapshot: item.size_snapshot, color_snapshot: item.color_snapshot }; }) };
    }
    if (q.startsWith("SELECT id, return_request_id, from_status, to_status, actor_type, note, created_at FROM return_status_events")) {
      const ids = new Set(v); return { success: true, results: this.db.returnStatusEvents.filter((row) => ids.has(row.return_request_id)) };
    }
    if (q.startsWith("SELECT r.id, r.order_id, r.customer_id, r.return_number, r.reason, r.details, r.status, r.refund_amount_paisa, r.refund_method, r.refund_reference, r.admin_note, r.created_at, r.updated_at, o.order_number")) {
      const rows = [...this.db.returnRequests.values()].map((row) => ({ ...row, order_number: this.db.orders.get(row.order_id)?.order_number, payment_provider: this.db.orders.get(row.order_id)?.payment_provider, payment_status: this.db.orders.get(row.order_id)?.payment_status, customer_name: [...this.db.customers.values()].find((customer) => customer.id === row.customer_id)?.full_name, customer_email: [...this.db.customers.values()].find((customer) => customer.id === row.customer_id)?.email, customer_phone: [...this.db.customers.values()].find((customer) => customer.id === row.customer_id)?.phone }));
      return { success: true, results: rows };
    }
    if (q.startsWith("SELECT id, quantity, unit_price_paisa FROM order_items WHERE order_id = ? AND id IN")) {
      const ids = new Set(v.slice(1));
      return { success: true, results: this.db.orderItems.filter((row) => row.order_id === v[0] && ids.has(row.id)) };
    }
    if (q.startsWith("SELECT r.id, r.order_id, r.return_number, r.reason, r.details, r.status, r.refund_amount_paisa, r.refund_method, r.refund_reference, r.admin_note, r.created_at, r.updated_at, o.order_number FROM return_requests r")) {
      const rows = [...this.db.returnRequests.values()].filter((row) => row.customer_id === v[0]).map((row) => ({ ...row, order_number: this.db.orders.get(row.order_id)?.order_number }));
      return { success: true, results: rows };
    }
    if (q.startsWith("SELECT r.id, r.order_id, r.customer_id, r.return_number, r.reason, r.details, r.status, r.refund_amount_paisa, r.refund_method, r.refund_reference, r.admin_note, r.created_at, r.updated_at, o.order_number")) {
      const rows = [...this.db.returnRequests.values()].map((row) => ({ ...row, order_number: this.db.orders.get(row.order_id)?.order_number, payment_provider: this.db.orders.get(row.order_id)?.payment_provider, payment_status: this.db.orders.get(row.order_id)?.payment_status, customer_name: [...this.db.customers.values()].find((customer) => customer.id === row.customer_id)?.full_name, customer_email: [...this.db.customers.values()].find((customer) => customer.id === row.customer_id)?.email, customer_phone: [...this.db.customers.values()].find((customer) => customer.id === row.customer_id)?.phone }));
      return { success: true, results: rows };
    }
    if (q.startsWith("SELECT ri.id, ri.return_request_id, ri.order_item_id, ri.quantity, ri.unit_refund_paisa, oi.product_name_snapshot")) {
      const ids = new Set(v); return { success: true, results: this.db.returnRequestItems.filter((row) => ids.has(row.return_request_id)).map((row) => ({ ...row, ...this.db.orderItems.find((item) => item.id === row.order_item_id) })) };
    }
    if (q.startsWith("SELECT id, return_request_id, from_status, to_status, actor_type, note, created_at FROM return_status_events")) {
      const ids = new Set(v); return { success: true, results: this.db.returnStatusEvents.filter((row) => ids.has(row.return_request_id)) };
    }
    if (q.startsWith("SELECT id, order_id, from_status, to_status, actor_type, note, created_at FROM order_status_events WHERE order_id IN")) { const ids = new Set(v); return { success: true, results: this.db.orderStatusEvents.filter((row) => ids.has(row.order_id)) }; }
    if (q.startsWith("SELECT id, order_number, city, subtotal_paisa, delivery_fee_paisa, total_paisa, discount_code, discount_label, discount_amount_paisa, free_delivery, payment_method, payment_provider, payment_status, order_status, delivery_fee_status, created_at, updated_at FROM orders WHERE customer_id = ?")) return { success: true, results: [...this.db.orders.values()].filter((row) => row.customer_id === v[0]) };
    if (q.startsWith("SELECT id, order_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM order_items WHERE order_id IN")) { const ids = new Set(v); return { success: true, results: this.db.orderItems.filter((row) => ids.has(row.order_id)) }; }
    if (q.startsWith("SELECT id, reference_code, vehicle_id, customer_name, pickup_city, pickup_address, destination_city, destination_address, pickup_at, return_at, driver_option, status, created_at FROM rental_requests WHERE customer_id = ?")) return { success: true, results: [...this.db.rentalRequests.values()].filter((row) => row.customer_id === v[0]) };
    if (q.startsWith("SELECT pm.product_id, a.id, a.media_type, a.mime_type, a.alt_text, a.caption, pm.color, pm.position, pm.is_primary FROM product_media_assets")) {
      return { success: true, results: [] };
    }
    if (q.startsWith("SELECT id, product_id, sku, size, color, stock_on_hand, reserved_quantity FROM product_variants WHERE is_active = 1")) {
      const ids = new Set(v);
      return { success: true, results: [...this.db.variants.values()].filter((row) => ids.has(row.product_id)).map((row) => ({ ...row, reserved_quantity: row.reserved_quantity ?? 0 })) };
    }
    if (q.startsWith("SELECT id, name, vehicle_type, transmission, seats, fuel_type, daily_rate_paisa, with_driver_daily_rate_paisa, image_key, description FROM vehicles WHERE status = 'available'")) return { success: true, results: [...this.db.vehicles.values()].filter((row) => row.status === "available") };
    if (q.startsWith("SELECT id, name, vehicle_type, transmission, seats, fuel_type, daily_rate_paisa, with_driver_daily_rate_paisa, status, image_key, description, created_at, updated_at FROM vehicles")) return { success: true, results: [...this.db.vehicles.values()] };
    if (q.startsWith("SELECT r.id, r.vehicle_id, r.customer_name, r.phone, r.email, r.pickup_location, r.destination, r.pickup_at, r.return_at, r.driver_option, r.status, r.customer_note, r.admin_note, r.reference_code, r.created_at, r.updated_at, v.name AS vehicle_name")) {
      return { success: true, results: [...this.db.rentalRequests.values()].map((row) => ({ ...row, vehicle_name: row.vehicle_id ? this.db.vehicles.get(row.vehicle_id)?.name ?? null : null, vehicle_type: row.vehicle_id ? this.db.vehicles.get(row.vehicle_id)?.vehicle_type ?? null : null })) };
    }
    if (q.startsWith("SELECT id, enquiry_id, business_name, contact_name, phone, email, requested_items, quoted_total_paisa, status, valid_until, delivery_address, city, customer_note, approval_token, converted_order_id, created_at, updated_at FROM wholesale_quotes")) {
      return { success: true, results: [...this.db.wholesaleQuotes.values()].slice(0, 100) };
    }
    if (q.startsWith("SELECT id, quote_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id IN")) {
      const ids = new Set(v); return { success: true, results: this.db.wholesaleQuoteItems.filter((row) => ids.has(row.quote_id)) };
    }
    if (q.startsWith("SELECT product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id = ?")) {
      return { success: true, results: this.db.wholesaleQuoteItems.filter((row) => row.quote_id === v[0]).map(({ product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa }) => ({ product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa })) };
    }
    if (q.startsWith("SELECT variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, unit_cost_paisa, line_total_paisa FROM wholesale_quote_items WHERE quote_id = ?")) {
      return { success: true, results: this.db.wholesaleQuoteItems.filter((row) => row.quote_id === v[0]) };
    }
    if (q.startsWith("SELECT id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa")) {
      return { success: true, results: [...this.db.orders.values()].slice(0, v[0]) };
    }
    if (q.startsWith("SELECT id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, line_total_paisa FROM order_items WHERE order_id IN")) {
      const ids = new Set(v);
      return { success: true, results: this.db.orderItems.filter((row) => ids.has(row.order_id)) };
    }
    if (q.startsWith("SELECT variant_id, quantity FROM order_items WHERE order_id = ?")) {
      return { success: true, results: this.db.orderItems.filter((row) => row.order_id === v[0]).map(({variant_id,quantity}) => ({variant_id,quantity})) };
    }
    if (q.startsWith("SELECT id, variant_id, quantity FROM order_items WHERE order_id = ?")) {
      return { success: true, results: this.db.orderItems.filter((row) => row.order_id === v[0]) };
    }
    if (q.startsWith("SELECT id, product_id, sku, size, color, stock_on_hand, reserved_quantity, barcode, cost_price_paisa, reorder_level, is_active, created_at, updated_at FROM product_variants WHERE product_id = ?")) {
      return { success: true, results: [...this.db.variants.values()].filter((row) => row.product_id === v[0]) };
    }
    if (q.startsWith("SELECT v.id,v.sku,v.size,v.color,v.stock_on_hand,v.reserved_quantity,v.is_active,p.id AS product_id,p.name,p.status FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.sku=")) {
      const rows=[...this.db.variants.values()].filter(row=>String(row.sku).toLowerCase()===String(v[0]).toLowerCase()).slice(0,2);
      return {success:true,results:rows.map(row=>({...row,product_id:row.product_id,name:this.db.products.get(row.product_id)?.name??"Test product",status:this.db.products.get(row.product_id)?.status??"published"}))};
    }
    if (q.startsWith("SELECT id, movement_type, quantity_delta, reference_type, reference_id, note, created_at FROM inventory_movements WHERE variant_id = ?")) {
      return { success: true, results: this.db.movements.filter((row) => row.variant_id === v[0]).slice(0, 100) };
    }
    if (q.startsWith("SELECT id, COALESCE(contact_type, enquiry_type) AS enquiry_type, customer_name, phone, email, message, status, source, created_at FROM enquiries")) {
      const rows = [...this.db.enquiries.values()].map(item=>({...item,enquiry_type:item.contact_type||item.enquiry_type}))
        .filter(item=>!q.includes("COALESCE(contact_type, enquiry_type) = 'rental'")||item.enquiry_type==="rental")
        .filter(item=>!q.includes("NOT IN ('complaint','dmca','legal','business','other')")||!["complaint","dmca","legal","business","other"].includes(item.enquiry_type));
      return { success: true, results: rows.slice(0, v[0]) };
    }
    if (q.startsWith("SELECT * FROM ai_provider_keys WHERE provider='gemini' ORDER BY priority,created_at")) { if(this.db.failAiKeyRead) throw new Error("simulated D1 outage"); return { success: true, results: [...this.db.aiKeys.values()].sort((a,b)=>a.priority-b.priority) }; }
    if (q.startsWith("SELECT id, slug, name, description, category, audience, retail_price_paisa, image_key, seo_title, seo_description FROM products")) {
      const category = q.includes("category = ?") ? v[0] : null;
      const limit = v[v.length - 1];
      const rows = [...this.db.products.values()].filter((row) => row.status === "published" && (!category || row.category === category));
      return { success: true, results: rows.slice(0, limit) };
    }
    if (q.startsWith("SELECT id, slug, name, description, category, audience, status,")) {
      const hasStatus = q.includes("WHERE status = ?");
      const status = hasStatus ? v[0] : null;
      const limit = hasStatus ? v[1] : v[0];
      const offset = hasStatus ? v[2] : v[1];
      const rows = [...this.db.products.values()]
        .filter((item) => !status || item.status === status)
        .sort((a,b)=>(String(b.updated_at??"").localeCompare(String(a.updated_at??""))||String(b.id).localeCompare(String(a.id))));
      return { success: true, results: rows.slice(offset, offset + limit) };
    }
    if (q.startsWith("SELECT size, color, is_active FROM product_variants WHERE product_id = ?")) {
      return { success: true, results: [...this.db.variants.values()].filter(row => row.product_id === v[0]).map(row => ({ size: row.size ?? "", color: row.color ?? "", is_active: row.is_active ?? 1 })) };
    }
    if (q.startsWith("SELECT id, size, color, is_active FROM product_variants WHERE product_id = ?")) {
      return { success: true, results: [...this.db.variants.values()].filter(row => row.product_id === v[0]).map(row => ({ id: row.id, size: row.size ?? "", color: row.color ?? "", is_active: row.is_active ?? 1 })) };
    }
    throw new Error("Unexpected all query: " + q);
  }
  async run() {
    const q = this.sql;
    const v = this.values;
    if (q.startsWith("UPDATE orders SET order_status = ?")) {
      const [status, updatedAt, id, previousStatus] = v;
      const row = this.db.orders.get(id);
      const allowed = {
        pending: ["confirmed", "cancelled"],
        confirmed: ["processing", "cancelled"],
        processing: ["dispatched", "cancelled"],
        dispatched: ["delivered"],
      };
      if (!row || row.order_status !== previousStatus || !(allowed[previousStatus] || []).includes(status)) return { success: true, meta: { changes: 0 } };
      if (status === "processing" || status === "dispatched") {
        const paymentAllowed = ((!row.payment_provider || row.payment_provider === "manual") && row.payment_method === "cod") || row.payment_status === "paid";
        if (row.delivery_fee_status !== "accepted" || !paymentAllowed) return { success: true, meta: { changes: 0 } };
      }
      const quantities = new Map();
      for (const item of this.db.orderItems.filter(item => item.order_id === id && item.variant_id)) quantities.set(item.variant_id, (quantities.get(item.variant_id) || 0) + Number(item.quantity || 0));
      if (status === "dispatched" || status === "cancelled") {
        for (const [variantId, quantity] of quantities) {
          const variant = this.db.variants.get(variantId);
          if (!variant || Number(variant.reserved_quantity || 0) < quantity || (status === "dispatched" && Number(variant.stock_on_hand || 0) < quantity)) return { success: true, meta: { changes: 0 } };
        }
      }
      if (status === "cancelled" && row.payment_status === "paid") return { success: true, meta: { changes: 0 } };
      Object.assign(row, { order_status: status, updated_at: updatedAt });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE pos_receipt_outbox SET status='queued'")) {
      const [nextAttempt,id]=v;const row=[...this.db.posReceiptOutbox.values()].find(item=>item.id===id);
      if(!row||row.status!=="failed")return {success:true,meta:{changes:0}};
      Object.assign(row,{status:"queued",attempts:0,next_attempt_at:nextAttempt,processing_started_at:null,last_error_code:null});
      return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("UPDATE ai_provider_keys SET failure_count=0,cooldown_until=NULL,last_error=NULL,last_used_at=")) {
      const fingerprint=q.includes("WHERE key_fingerprint=?")?v[2]:null;
      const id=q.includes("WHERE id=?")?v[2]:null;
      const row=[...this.db.aiKeys.values()].find(item=>fingerprint?item.key_fingerprint===fingerprint:item.id===id);
      if(row){row.failure_count=0;row.cooldown_until=null;row.last_error=null;row.last_used_at=v[0];row.updated_at=v[1];}
      return {success:true,meta:{changes:row?1:0}};
    }
    if (q.startsWith("INSERT INTO ai_provider_keys")) {
      const [id,label,key_ciphertext,key_iv,key_fingerprint,encryption_mode,priority,created_at,updated_at]=v;
      this.db.aiKeys.set(id,{id,provider:"gemini",label,key_ciphertext,key_iv,key_fingerprint,encryption_mode,priority,enabled:1,failure_count:0,cooldown_until:null,last_used_at:null,last_error:null,created_at,updated_at});
      return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("INSERT INTO notification_outbox")) {
      const [id, referenceId] = v;
      const rental = q.includes("rental_request_id");
      this.db.notificationOutbox.set(id, { id, order_id: rental ? null : referenceId, rental_request_id: rental ? referenceId : null, channel: "email", template_key: rental ? "owner_rental_created" : "owner_order_created", status: "queued", attempts: 0 });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO owner_notifications")) {
      if (q.includes("SELECT ?, 'order.created'")) {
        const [id, title, body, entity_id, orderId] = v;
        if (this.db.orders.has(orderId)) this.db.notifications.set(id, { id, event_type: "order.created", title, body, entity_type: "order", entity_id, is_read: 0, created_at: new Date().toISOString(), read_at: null });
      } else {
        const [id, event_type, title, body, entity_type, entity_id] = v;
        this.db.notifications.set(id, { id, event_type, title, body, entity_type, entity_id, is_read: 0, created_at: new Date().toISOString(), read_at: null });
      }
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE owner_notifications SET is_read=1,read_at=? WHERE is_read=0")) {
      let changes = 0; for (const row of this.db.notifications.values()) if (!row.is_read) { row.is_read = 1; row.read_at = v[0]; changes += 1; }
      return { success: true, meta: { changes } };
    }
    if (q.startsWith("UPDATE owner_notifications SET is_read=1,read_at=? WHERE id=?")) {
      const row = this.db.notifications.get(v[1]); if (row && !row.is_read) Object.assign(row, { is_read: 1, read_at: v[0] });
      return { success: true, meta: { changes: row && row.is_read ? 1 : 0 } };
    }
    if (q.startsWith("INSERT INTO media_assets")) {
      const [id,object_key,mime_type,byte_size,alt_text,uploaded_by]=v;
      if(this.db.mediaAssets.has(id))throw new Error("UNIQUE constraint failed: media_assets.id");
      this.db.mediaAssets.set(id,{id,object_key,media_type:"image",mime_type,byte_size,alt_text,caption:"",status:q.includes("'processing'")?"processing":"ready",uploaded_by,updated_at:new Date().toISOString()});
      return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("UPDATE media_assets SET status='ready'")) {
      const [updated_at,id,uploaded_by]=v;const row=this.db.mediaAssets.get(id);
      if(!row||row.uploaded_by!==uploaded_by||row.status!=="processing")return {success:true,meta:{changes:0}};
      Object.assign(row,{status:"ready",updated_at});
      return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("UPDATE media_assets SET updated_at=? WHERE id=? AND status='processing'")) {
      const [updated_at,id,uploaded_by,expected]=v;const row=this.db.mediaAssets.get(id);
      if(!row||row.uploaded_by!==uploaded_by||row.status!=="processing"||row.updated_at!==expected)return {success:true,meta:{changes:0}};
      row.updated_at=updated_at;return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("DELETE FROM media_assets WHERE id=?")) {
      const [id,uploaded_by]=v;const row=this.db.mediaAssets.get(id);
      if(row&&row.uploaded_by===uploaded_by&&row.status==="processing"){this.db.mediaAssets.delete(id);return {success:true,meta:{changes:1}};}
      return {success:true,meta:{changes:0}};
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'media.bulk_uploaded'")) {
      this.db.audits.push({id:v[0],actor_admin_id:v[1],action:"media.bulk_uploaded",entity_type:"media_asset",entity_id:v[2],metadata_json:v[3]});
      return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("INSERT INTO return_requests")) {
      const [id, order_id, customer_id, return_number, reason, details, refund_amount_paisa] = v;
      if ([...this.db.returnRequests.values()].some((row) => row.order_id === order_id)) throw new Error("UNIQUE constraint failed: return_requests.order_id");
      this.db.returnRequests.set(id, { id, order_id, customer_id, return_number, reason, details, status: "requested", refund_amount_paisa, refund_method: null, refund_reference: null, admin_note: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO return_request_items")) {
      const [id, return_request_id, order_item_id, quantity, unit_refund_paisa] = v;
      this.db.returnRequestItems.push({ id, return_request_id, order_item_id, quantity, unit_refund_paisa });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO return_status_events")) {
      const actor_type = q.includes("'customer'") ? "customer" : "admin";
      const id = v[0], return_request_id = v[1];
      const from_status = actor_type === "customer" ? null : v[2];
      const to_status = actor_type === "customer" ? "requested" : v[3];
      const actor_id = actor_type === "customer" ? v[2] : v[4];
      const note = actor_type === "customer" ? "Return request submitted" : v[5];
      this.db.returnStatusEvents.push({ id, return_request_id, from_status, to_status, actor_type, actor_id, note, created_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE return_requests SET admin_note = ?")) {
      const [admin_note, updated_at, id, expected] = v;
      const row = this.db.returnRequests.get(id);
      if (!row || row.status !== expected) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { admin_note, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE exchange_requests SET admin_note = ?")) {
      const [admin_note, updated_at, id, expected] = v;
      const row = this.db.exchangeRequests.get(id);
      if (!row || row.status !== expected) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { admin_note, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE return_requests SET status = ?")) {
      const [status, admin_note, refund_method, refund_reference, reviewed_status, reviewed_by, received_status, received_at, refunded_status, refunded_at, updated_at, id, expected] = v;
      const row = this.db.returnRequests.get(id);
      if (!row || row.status !== expected) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { status, admin_note, refund_method: refund_method ?? row.refund_method, refund_reference: refund_reference ?? row.refund_reference, reviewed_by_admin_id: reviewed_status === "approved" || reviewed_status === "rejected" ? reviewed_by : row.reviewed_by_admin_id, received_at: received_status === "received" ? received_at : row.received_at, refunded_at: refunded_status === "refunded" ? refunded_at : row.refunded_at, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO payment_webhook_events")) {
      const [id, eventId, digest] = v;
      const previous = this.db.paymentWebhookEvents.get(eventId);
      if (!previous) this.db.paymentWebhookEvents.set(eventId, { id, provider_event_id: eventId, payload_sha256: digest, processing_status: "received" });
      else if (previous.payload_sha256 === digest && !["processed", "ignored"].includes(previous.processing_status)) Object.assign(previous, { processing_status: "received" });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE payment_attempts SET status = 'pending', failure_code")) {
      const row = this.db.paymentAttempts.get(v[1]);
      if (!row || !["created", "pending"].includes(row.status)) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { status: "pending", failure_code: "provider_declined", updated_at: v[0] });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE payment_attempts SET status = 'succeeded'")) {
      const row = this.db.paymentAttempts.get(v[1]);
      const order = row && this.db.orders.get(row.order_id);
      const eligible = order && order.payment_provider === "safepay" && (order.payment_status !== "paid" || !order.financial_transaction_id) && order.total_paisa === row.amount_paisa && order.delivery_fee_status === "accepted" && ["pending", "confirmed"].includes(order.order_status);
      if (!row || !["created", "pending"].includes(row.status) || (q.includes("AND EXISTS (SELECT 1 FROM orders") && !eligible)) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { status: "succeeded", updated_at: v[0] });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE orders SET payment_status = 'paid', financial_account_id")) {
      const [transactionId, updatedAt, id, amount, attemptId] = v;
      const row = this.db.orders.get(id);
      const attempt = this.db.paymentAttempts.get(attemptId);
      if (!row || !attempt || attempt.order_id !== id || attempt.status !== "succeeded" || attempt.amount_paisa !== amount || row.payment_provider !== "safepay" || (row.payment_status === "paid" && row.financial_transaction_id) || row.total_paisa !== amount || row.delivery_fee_status !== "accepted" || !["pending", "confirmed"].includes(row.order_status)) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { payment_status: "paid", financial_account_id:"gateway-clearing", financial_transaction_id:transactionId, updated_at: updatedAt });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO financial_transactions")) {
      const [id, amount_paisa, reference_id] = v;
      const order = this.db.orders.get(reference_id);
      const attempt = this.db.paymentAttempts.get(v[5]);
      const shouldInsert = order?.payment_status === "paid" && order.financial_transaction_id === id && attempt?.status === "succeeded";
      if (!shouldInsert) return { success: true, meta: { changes: 0 } };
      this.db.financialTransactions.push({ id, account_id: "gateway-clearing", direction: "in", amount_paisa, category: "website_order", reference_type: "order", reference_id });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE payment_webhook_events SET processing_status = 'processed'")) {
      const row = this.db.paymentWebhookEvents.get(v[1]);
      if (row) Object.assign(row, { processing_status: "processed", processed_at: v[0] });
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("UPDATE payment_webhook_events SET processing_status = 'failed'")) {
      const row = this.db.paymentWebhookEvents.get(v[0]);
      if (row) row.processing_status = "failed";
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("INSERT INTO order_inventory_reservations")) {
      const [id, order_id, variant_id, quantity, reserved_at, updated_at] = v;
      const order = this.db.orders.get(order_id);
      if (!order) return { success: true, meta: { changes: 0 } };
      const key = order_id + ":" + variant_id;
      if (this.db.orderInventoryReservations.has(key)) return { success: true, meta: { changes: 0 } };
      this.db.orderInventoryReservations.set(key, { id, order_id, variant_id, quantity, status: "reserved", payment_provider: order.payment_provider ?? "manual", payment_reference: null, reserved_at, released_at: null, consumed_at: null, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE order_inventory_reservations SET payment_reference")) {
      const [payment_reference, updated_at, order_id] = v;
      let changes = 0;
      for (const row of this.db.orderInventoryReservations.values()) if (row.order_id === order_id && row.status === "reserved" && row.payment_provider === "safepay") { row.payment_reference = payment_reference; row.updated_at = updated_at; changes += 1; }
      return { success: true, meta: { changes } };
    }
    if (q.startsWith("UPDATE order_inventory_reservations SET status = 'released'")) {
      const [released_at, updated_at, order_id, variant_id] = v;
      const row = this.db.orderInventoryReservations.get(order_id + ":" + variant_id);
      if (!row || row.status !== "reserved") return { success: true, meta: { changes: 0 } };
      Object.assign(row, { status: "released", released_at, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE order_inventory_reservations SET status = 'consumed'")) {
      const [consumed_at, updated_at, order_id, variant_id] = v;
      const row = this.db.orderInventoryReservations.get(order_id + ":" + variant_id);
      if (!row || row.status !== "reserved") return { success: true, meta: { changes: 0 } };
      Object.assign(row, { status: "consumed", consumed_at, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE orders SET payment_provider = 'safepay'")) { const row = this.db.orders.get(v[0]); if (!row || row.payment_provider === "safepay") return { success: true, meta: { changes: 0 } }; row.payment_provider = "safepay"; return { success: true, meta: { changes: 1 } }; }
    if (q.startsWith("INSERT INTO order_status_events")) { const id = v[0], order_id = v[1], from_status = v[2], to_status = v[3]; const actor_type = q.includes("'admin'") ? "admin" : "system"; const actor_id = actor_type === "admin" ? v[4] : null; const note = actor_type === "admin" ? v[5] : "Order received"; this.db.orderStatusEvents.push({ id, order_id, from_status, to_status, actor_type, actor_id, note, created_at: new Date().toISOString() }); return { success: true, meta: { changes: 1 } }; }
    if (q.startsWith("INSERT INTO customers")) {
      const [id, email, password_hash, full_name, phone] = v;
      if ([...this.db.customers.values()].some((row) => row.email.toLowerCase() === email.toLowerCase())) throw new Error("UNIQUE constraint failed: customers.email");
      this.db.customers.set(id, { id, email, password_hash, full_name, phone, status: "active", email_verified_at: null, last_login_at: null });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO customer_sessions")) {
      const [id, customer_id, token_hash, expires_at] = v;
      if (!this.db.customers.has(customer_id)) return { success: true, meta: { changes: 0 } };
      this.db.customerSessions.set(id, { id, customer_id, token_hash, expires_at, revoked_at: null });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE customers SET last_login_at")) { const row = this.db.customers.get(v[2]); if (row) Object.assign(row, { last_login_at: v[0], updated_at: v[1] }); return { success: true, meta: { changes: row ? 1 : 0 } }; }
    if (q.startsWith("UPDATE customers SET full_name")) { const row = this.db.customers.get(v[3]); if (row) Object.assign(row, { full_name: v[0], phone: v[1], updated_at: v[2] }); return { success: true, meta: { changes: row ? 1 : 0 } }; }
    if (q.startsWith("UPDATE customers SET password_hash")) { const row = this.db.customers.get(v[2]); if (row) Object.assign(row, { password_hash: v[0], updated_at: v[1] }); return { success: true, meta: { changes: row ? 1 : 0 } }; }
    if (q.startsWith("UPDATE customer_sessions SET revoked_at = ? WHERE customer_id")) { let changes = 0; for (const row of this.db.customerSessions.values()) if (row.customer_id === v[1] && row.id !== v[2] && !row.revoked_at) { row.revoked_at = v[0]; changes += 1; } return { success: true, meta: { changes } }; }
    if (q.startsWith("UPDATE customer_sessions SET revoked_at")) { let changes = 0; for (const row of this.db.customerSessions.values()) if (row.token_hash === v[1] && !row.revoked_at) { row.revoked_at = v[0]; changes += 1; } return { success: true, meta: { changes } }; }
    if (q.startsWith("UPDATE orders SET customer_id")) { const row = this.db.orders.get(v[1]); if (row && !row.customer_id) { row.customer_id = v[0]; return { success: true, meta: { changes: 1 } }; } return { success: true, meta: { changes: 0 } }; }
    if (q.startsWith("UPDATE rental_requests SET customer_id")) { const row = this.db.rentalRequests.get(v[1]); if (row && !row.customer_id) { row.customer_id = v[0]; return { success: true, meta: { changes: 1 } }; } return { success: true, meta: { changes: 0 } }; }
    if (q.startsWith("INSERT INTO store_settings")) { const key=q.match(/VALUES\s*\('([^']+)'/i)?.[1]; if(!key)return {success:true,meta:{changes:0}}; this.db.storeSettings.set(key,{setting_value_json:v[0],is_public:q.includes("?,1,")?1:0}); return {success:true,meta:{changes:1}}; }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'pos.receipt_retry_requested'")) { this.db.audits.push({action:"pos.receipt_retry_requested",values:v}); return {success:true,meta:{changes:1}}; }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'owner.payment_methods_updated'")) { this.db.audits.push(v); return {success:true,meta:{changes:1}}; }
    if (q.startsWith("UPDATE orders SET delivery_fee_paisa = ?")) {
      const [fee, total, tokenHash, expiresAt, quotedAt, updatedAt, id] = v;
      const row = this.db.orders.get(id);
      if (!row || !["pending", "confirmed"].includes(row.order_status)) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { delivery_fee_paisa: fee, total_paisa: total, delivery_fee_status: "awaiting_customer", delivery_fee_token_hash: tokenHash, delivery_fee_expires_at: expiresAt, delivery_fee_quote_sent_at: quotedAt, delivery_fee_accepted_at: null, updated_at: updatedAt });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE orders SET delivery_fee_status = 'accepted'")) {
      const [acceptedAt, updatedAt, id, tokenHash, now] = v;
      const row = this.db.orders.get(id);
      if (!row || row.delivery_fee_token_hash !== tokenHash || row.delivery_fee_status !== "awaiting_customer" || row.delivery_fee_expires_at <= now) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { delivery_fee_status: "accepted", delivery_fee_token_hash: null, delivery_fee_expires_at: null, delivery_fee_accepted_at: acceptedAt, updated_at: updatedAt });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE orders SET order_status = 'cancelled', delivery_fee_status = 'declined'")) {
      const [updatedAt, id, tokenHash, now, orderId] = v;
      const row = this.db.orders.get(id);
      const totals = new Map();
      for (const item of this.db.orderItems.filter(item => item.order_id === orderId && item.variant_id)) totals.set(item.variant_id, (totals.get(item.variant_id) ?? 0) + item.quantity);
      const reserved = [...totals].every(([variantId, required]) => (this.db.variants.get(variantId)?.reserved_quantity ?? 0) >= required);
      if (!row || !reserved || row.delivery_fee_token_hash !== tokenHash || row.delivery_fee_status !== "awaiting_customer" || row.delivery_fee_expires_at <= now) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { order_status: "cancelled", delivery_fee_status: "declined", delivery_fee_token_hash: null, delivery_fee_expires_at: null, updated_at: updatedAt });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'order.delivery_fee_quoted'")) {
      this.db.audits.push(v); return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'order.delivery_fee_accepted'")) {
      this.db.audits.push({ action: "order.delivery_fee_accepted", values: v }); return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'order.delivery_fee_declined'")) {
      this.db.audits.push({ action: "order.delivery_fee_declined", values: v }); return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO enquiry_email_queue")) { const [id,enquiry_id]=v; this.db.enquiryEmailQueue.set(id,{id,enquiry_id,status:"queued",attempts:0}); return {success:true,meta:{changes:1}}; }
    if (q.startsWith("INSERT INTO enquiries")) {
      const [id, enquiry_type, contact_type, customer_name, phone, email, message] = v;
      this.db.enquiries.set(id, { id, enquiry_type, contact_type, customer_name, phone, email, message, status: "new", source: "website", created_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO vehicles")) {
      const [id, name, vehicle_type, transmission, seats, fuel_type, daily_rate_paisa, with_driver_daily_rate_paisa, status, image_key, description] = v;
      this.db.vehicles.set(id, { id, name, vehicle_type, transmission, seats, fuel_type, daily_rate_paisa, with_driver_daily_rate_paisa, status, image_key, description, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE vehicles SET status = ?")) {
      const [status, updated_at, id, previousStatus] = v;
      const row = this.db.vehicles.get(id);
      if (!row || row.status !== previousStatus) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { status, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE vehicles SET name")) {
      const [name, vehicle_type, transmission, seats, fuel_type, daily_rate_paisa, with_driver_daily_rate_paisa, status, image_key, description, updated_at, id] = v;
      const row = this.db.vehicles.get(id);
      if (!row) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { name, vehicle_type, transmission, seats, fuel_type, daily_rate_paisa, with_driver_daily_rate_paisa, status, image_key, description, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO rental_requests")) {
      const [id, vehicle_id, customer_name, phone, pickup_location, destination, pickup_at, return_at, driver_option, email, customer_note, reference_code, updated_at, pickup_city, pickup_address, destination_city, destination_address, customer_id, rental_days, estimated_daily_rate_paisa, estimated_total_paisa, cnic_consent_version, cnic_consent_at] = v;
      const guardVehicle = v[23];
      if (guardVehicle !== vehicle_id) return { success: true, meta: { changes: 0 } };
      if (vehicle_id) {
        const vehicle = this.db.vehicles.get(vehicle_id);
        const overlap = [...this.db.rentalRequests.values()].some((row) => row.vehicle_id === vehicle_id && ["confirmed", "active"].includes(row.status) && row.pickup_at < return_at && row.return_at > pickup_at);
        if (!vehicle || vehicle.status !== "available" || overlap) return { success: true, meta: { changes: 0 } };
      }
      this.db.rentalRequests.set(id, { id, vehicle_id, customer_name, phone, email, pickup_location, destination, pickup_city, pickup_address, destination_city, destination_address, customer_id, rental_days, estimated_daily_rate_paisa, estimated_total_paisa, cnic_consent_version, cnic_consent_at, document_upload_token_hash: null, document_upload_expires_at: null, pickup_at, return_at, driver_option, status: "requested", customer_note, admin_note: "", reference_code, created_at: updated_at, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO rental_documents")) {
      const [id, rental_request_id, document_side, object_key, mime_type, byte_size] = v;
      if (!this.db.rentalRequests.has(rental_request_id)) return { success: true, meta: { changes: 0 } };
      this.db.rentalDocuments.set(id, { id, rental_request_id, document_side, object_key, mime_type, byte_size });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("rental.created_with_cnic")) { this.db.audits.push({ action: "rental.created_with_cnic", values: v }); return { success: true, meta: { changes: 1 } }; }
    if (q.startsWith("UPDATE rental_requests SET vehicle_id = ?")) {
      const [vehicle_id, status, admin_note, updated_at, id, expected, guardStatus, guardVehicle, existsVehicle, overlapVehicle] = v;
      const row = this.db.rentalRequests.get(id);
      if (!row || row.status !== expected) return { success: true, meta: { changes: 0 } };
      if (status === "confirmed") {
        const vehicle = this.db.vehicles.get(vehicle_id);
        const overlap = [...this.db.rentalRequests.values()].some((other) => other.id !== id && other.vehicle_id === vehicle_id && ["confirmed", "active"].includes(other.status) && other.pickup_at < row.return_at && other.return_at > row.pickup_at);
        if (guardStatus !== "confirmed" || guardVehicle !== vehicle_id || existsVehicle !== vehicle_id || overlapVehicle !== vehicle_id || !vehicle || vehicle.status !== "available" || overlap) return { success: true, meta: { changes: 0 } };
      }
      Object.assign(row, { vehicle_id, status, admin_note, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO wholesale_quotes")) {
      const [id, enquiry_id, business_name, contact_name, phone, email, requested_items, quoted_total_paisa, valid_until, delivery_address, city, customer_note, approval_token, updated_at] = v;
      this.db.wholesaleQuotes.set(id, { id, enquiry_id, business_name, contact_name, phone, email, requested_items, quoted_total_paisa, status: "prepared", valid_until, delivery_address, city, customer_note, approval_token, converted_order_id: null, created_at: updated_at, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO wholesale_quote_items")) {
      const [id, quote_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, unit_cost_paisa, line_total_paisa] = v;
      if (!this.db.wholesaleQuotes.has(quote_id)) return { success: true, meta: { changes: 0 } };
      this.db.wholesaleQuoteItems.push({ id, quote_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, unit_cost_paisa, line_total_paisa });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE wholesale_quotes SET status = ?")) {
      const row = this.db.wholesaleQuotes.get(v[2]);
      if (!row || row.status !== v[3]) return { success: true, meta: { changes: 0 } };
      row.status = v[0]; row.updated_at = v[1];
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE wholesale_quotes SET status = 'declined'")) {
      const row = this.db.wholesaleQuotes.get(v[1]);
      if (!row || row.status !== "sent") return { success: true, meta: { changes: 0 } };
      row.status = "declined"; row.updated_at = v[0];
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO orders") && q.includes("source_quote_id")) {
      const [id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, customer_note, source_quote_id, customer_id] = v;
      const quote = this.db.wholesaleQuotes.get(source_quote_id);
      const guardQuoteId = v[13]; const guardNow = v[14];
      if (!quote || quote.status !== "sent" || guardQuoteId !== source_quote_id || Date.parse(quote.valid_until) <= Date.parse(guardNow) || [...this.db.orders.values()].some((row) => row.source_quote_id === source_quote_id)) return { success: true, meta: { changes: 0 } };
      const checks = v.slice(15);
      for (let i = 0; i < checks.length; i += 2) { const variant = this.db.variants.get(checks[i]); if (!variant || variant.stock_on_hand - (variant.reserved_quantity ?? 0) < checks[i + 1]) return { success: true, meta: { changes: 0 } }; }
      this.db.orders.set(id, { id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, customer_note, source_quote_id, customer_id, payment_method: "cod", payment_status: "pending", order_status: "pending", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE wholesale_quotes SET status = 'accepted'")) {
      const [converted_order_id, updated_at, id, orderId] = v;
      const row = this.db.wholesaleQuotes.get(id);
      if (!row || row.status !== "sent" || !this.db.orders.has(orderId)) return { success: true, meta: { changes: 0 } };
      row.status = "accepted"; row.converted_order_id = converted_order_id; row.updated_at = updated_at;
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'wholesale_quote.accepted'")) {
      this.db.audits.push(v); return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO orders")) {
      const [id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, discount_code, discount_label, discount_amount_paisa, free_delivery, customer_note, checkout_token, delivery_fee_status, customer_id] = v;
      if ([...this.db.orders.values()].some((row) => row.checkout_token === checkout_token)) return { success: true, meta: { changes: 0 } };
      const checks = v.slice(18);
      for (let i = 0; i < checks.length; i += 2) {
        const variant = this.db.variants.get(checks[i]);
        if (!variant || variant.is_active !== 1 || variant.stock_on_hand - (variant.reserved_quantity ?? 0) < checks[i + 1]) return { success: true, meta: { changes: 0 } };
      }
      this.db.orders.set(id, { id, order_number, customer_name, phone, email, delivery_address, city, subtotal_paisa, delivery_fee_paisa, total_paisa, discount_code, discount_label, discount_amount_paisa, free_delivery, payment_method: "cod", payment_provider: "manual", payment_status: "pending", order_status: "pending", customer_note, checkout_token, delivery_fee_status, customer_id, delivery_fee_token_hash: null, delivery_fee_expires_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE orders SET payment_method = ?")) {
      const [payment_method,id] = v;
      const order=this.db.orders.get(id);
      if(!order||order.payment_provider!=="manual")return {success:true,meta:{changes:0}};
      order.payment_method=payment_method;order.payment_status="pending";
      return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'order.manual_payment_verified'")) { this.db.audits.push(v); return {success:true,meta:{changes:1}}; }
    if (q.startsWith("UPDATE orders SET payment_status='paid',financial_account_id")) {
      const [accountId,transactionId,updated_at,id,requiresDelivered] = v;
      const order=this.db.orders.get(id);
      if(!order||order.payment_provider!=="manual"||(order.payment_status!=="pending"&&!(order.payment_status==="paid"&&!order.financial_transaction_id))||(requiresDelivered===1&&order.order_status!=="delivered"))return {success:true,meta:{changes:0}};
      Object.assign(order,{payment_status:"paid",financial_account_id:accountId,financial_transaction_id:transactionId,updated_at});
      return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("INSERT INTO financial_transactions")) {
      const id=v[0];
      const gateway=q.includes("'gateway-clearing'");
      this.db.financialTransactions.push({id,account_id:gateway?"gateway-clearing":v[1],amount_paisa:gateway?v[1]:v[2],reference_id:gateway?v[2]:v[3]});
      return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("UPDATE product_variants SET reserved_quantity = reserved_quantity + ?")) {
      const row = this.db.variants.get(v[2]);
      if (!row || row.stock_on_hand - (row.reserved_quantity ?? 0) < v[3] || !this.db.orders.has(v[4])) return { success: true, meta: { changes: 0 } };
      row.reserved_quantity = (row.reserved_quantity ?? 0) + v[0];
      row.updated_at = v[1];
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO order_items")) {
      const [id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, unit_cost_paisa, line_total_paisa] = v;
      if (!this.db.orders.has(order_id)) return { success: true, meta: { changes: 0 } };
      this.db.orderItems.push({ id, order_id, variant_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot, quantity, unit_price_paisa, unit_cost_paisa, line_total_paisa });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE orders SET order_status = ?")) {
      const [status, updated_at, id, expected] = v;
      const order = this.db.orders.get(id);
      if (!order || order.order_status !== expected || (["processing", "dispatched"].includes(status) && order.delivery_fee_status !== "accepted") || (["processing", "dispatched"].includes(status) && order.payment_provider === "manual" && order.payment_method !== "cod" && order.payment_status !== "paid")) return { success: true, meta: { changes: 0 } };
      const items = this.db.orderItems.filter((item) => item.order_id === id && item.variant_id);
      const totals = new Map();
      for (const item of items) totals.set(item.variant_id, (totals.get(item.variant_id) ?? 0) + item.quantity);
      if (status === "cancelled" && [...totals].some(([variantId, quantity]) => (this.db.variants.get(variantId)?.reserved_quantity ?? 0) < quantity)) return { success: true, meta: { changes: 0 } };
      if (status === "dispatched" && [...totals].some(([variantId, quantity]) => { const variant = this.db.variants.get(variantId); return !variant || variant.stock_on_hand < quantity || (variant.reserved_quantity ?? 0) < quantity; })) return { success: true, meta: { changes: 0 } };
      Object.assign(order, { order_status: status, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE product_variants SET reserved_quantity = reserved_quantity - ?")) {
      const [quantity, updated_at, id, expected, orderId] = v;
      const row = this.db.variants.get(id);
      if (!row || (row.reserved_quantity ?? 0) < expected || this.db.orders.get(orderId)?.order_status !== "cancelled") return { success: true, meta: { changes: 0 } };
      row.reserved_quantity -= quantity; row.updated_at = updated_at;
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE product_variants SET stock_on_hand = stock_on_hand - ?")) {
      const [quantity, reserve, updated_at, id, stockCheck, reserveCheck, orderId] = v;
      const row = this.db.variants.get(id);
      if (!row || row.stock_on_hand < stockCheck || (row.reserved_quantity ?? 0) < reserveCheck || this.db.orders.get(orderId)?.order_status !== "dispatched") return { success: true, meta: { changes: 0 } };
      row.stock_on_hand -= quantity; row.reserved_quantity -= reserve; row.updated_at = updated_at;
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO inventory_movements") && q.includes("'sold'")) {
      const [id, variant_id, quantity_delta, reference_id, actor_admin_id] = v;
      this.db.movements.push({ id, variant_id, movement_type: "sold", quantity_delta, reference_type: "order", reference_id, note: "COD order dispatched", actor_admin_id, created_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("FROM orders")) {
      this.db.audits.push(v);
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO products")) {
      const [id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, seo_title, seo_description] = v;
      this.db.products.set(id, { id, slug, name, description, category, audience, status, retail_price_paisa, wholesale_price_paisa, seo_title, seo_description, updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO product_variants")) {
      const [id, product_id, sku, size, color, stock_on_hand] = v;
      if (sku && [...this.db.variants.values()].some((row) => row.sku === sku)) throw new Error("UNIQUE constraint failed: product_variants.sku");
      this.db.variants.set(id, { id, product_id, sku, size, color, stock_on_hand, reserved_quantity: 0, is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE product_variants SET stock_on_hand=?")) {
      const [quantity,updatedAt,id,current,reservedLimit]=v;
      const row=this.db.variants.get(id);
      const changed=Boolean(row&&row.is_active===1&&row.stock_on_hand===current&&(row.reserved_quantity??0)<=reservedLimit);
      if(changed){row.stock_on_hand=quantity;row.updated_at=updatedAt;}
      this.db.lastChanges=changed?1:0;
      return {success:true,meta:{changes:changed?1:0}};
    }
    if (q.startsWith("INSERT INTO inventory_movements") && q.includes("WHERE changes()=1")) {
      const [id,variant_id,quantity_delta,note,actor_admin_id]=v;
      if(this.db.lastChanges!==1)return {success:true,meta:{changes:0}};
      this.db.movements.push({id,variant_id,movement_type:"adjustment",quantity_delta,reference_type:"count",reference_id:null,note,actor_admin_id,created_at:new Date().toISOString()});
      this.db.lastChanges=1;
      return {success:true,meta:{changes:1}};
    }
    if (q.startsWith("UPDATE product_variants SET stock_on_hand = stock_on_hand + ?")) {
      const row = this.db.variants.get(v[2]);
      if (!row || row.is_active !== 1 || row.stock_on_hand !== v[3] || row.stock_on_hand + v[0] < 0) return { success: true, meta: { changes: 0 } };
      row.stock_on_hand += v[0];
      row.updated_at = v[1];
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE product_variants SET sku = ?")) {
      const row = this.db.variants.get(v[5]);
      if (!row) return { success: true, meta: { changes: 0 } };
      if (v[0] && [...this.db.variants.values()].some((item) => item.id !== row.id && item.sku === v[0])) throw new Error("UNIQUE constraint failed: product_variants.sku");
      Object.assign(row, { sku: v[0], size: v[1], color: v[2], is_active: v[3], updated_at: v[4] });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO inventory_movements")) {
      if (q.includes(" SELECT ")) {
        const [id, variant_id, movement_type, quantity_delta, reference_type, reference_id, note, actor_admin_id, expectedId, expectedStock] = v;
        const variant = this.db.variants.get(expectedId);
        if (!variant || variant.stock_on_hand !== expectedStock) return { success: true, meta: { changes: 0 } };
        this.db.movements.push({ id, variant_id, movement_type, quantity_delta, reference_type, reference_id, note, actor_admin_id, created_at: new Date().toISOString() });
      } else if (q.includes("'opening'")) {
        const [id, variant_id, quantity_delta, note, actor_admin_id] = v;
        this.db.movements.push({ id, variant_id, movement_type: "opening", quantity_delta, reference_type: "manual", reference_id: null, note, actor_admin_id, created_at: new Date().toISOString() });
      } else {
        const [id, variant_id, movement_type, quantity_delta, reference_type, note, actor_admin_id] = v;
        this.db.movements.push({ id, variant_id, movement_type, quantity_delta, reference_type, reference_id: null, note, actor_admin_id, created_at: new Date().toISOString() });
      }
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes(" SELECT ") && q.includes("EXISTS (SELECT 1 FROM inventory_movements")) {
      const [id, actor, action, entity, entityId, metadata, movementId] = v;
      if (!this.db.movements.some((row) => row.id === movementId)) return { success: true, meta: { changes: 0 } };
      this.db.audits.push([id, actor, action, entity, entityId, metadata]);
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("UPDATE enquiries SET status = ?")) {
      const row = this.db.enquiries.get(v[1]);
      if (row) row.status = v[0];
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("UPDATE products SET status='published',updated_at=? WHERE id IN")) {
      const [updatedAt, idsJson, _idsJsonAgain, expected] = v;
      const ids = JSON.parse(idsJson);
      const eligible = ids.every(id => {
        const product = this.db.products.get(id);
        const hasStock = [...this.db.variants.values()].some(row => row.product_id === id && row.is_active === 1 && row.stock_on_hand > (row.reserved_quantity ?? 0));
        const hasCover = [...this.db.productMediaAssets.values()].some(row => row.product_id === id && row.is_primary === 1 && row.color === "" && this.db.mediaAssets.get(row.media_asset_id)?.status === "ready" && this.db.mediaAssets.get(row.media_asset_id)?.media_type === "image");
        return product?.status === "draft" && product.name?.trim().length >= 2 && product.category?.trim().length >= 2 && product.retail_price_paisa > 0 && hasStock && hasCover;
      });
      const changed = eligible && ids.length === expected ? ids.length : 0;
      if (changed) for (const id of ids) Object.assign(this.db.products.get(id), { status: "published", updated_at: updatedAt });
      this.db.lastChanges = changed;
      return { success: true, meta: { changes: changed } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'product.bulk_published'")) {
      const [id, actor_admin_id, metadata_json, expected] = v;
      const changed = this.db.lastChanges === expected;
      if (changed) this.db.audits.push({ id, actor_admin_id, action: "product.bulk_published", entity_type: "product", entity_id: null, metadata_json });
      this.db.lastChanges = changed ? 1 : 0;
      return { success: true, meta: { changes: changed ? 1 : 0 } };
    }
    if (q.startsWith("UPDATE products SET slug")) {
      const [slug, name, description, category, audience, status, retail, wholesale, seo_title, seo_description, updated, id] = v;
      const row = this.db.products.get(id);
      if (row) Object.assign(row, { slug, name, description, category, audience, status, retail_price_paisa: retail, wholesale_price_paisa: wholesale, seo_title, seo_description, updated_at: updated });
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("UPDATE products SET status = 'archived'")) {
      const row = this.db.products.get(v[1]);
      if (row) Object.assign(row, { status: "archived", updated_at: v[0] });
      return { success: true, meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("INSERT INTO audit_logs") && q.includes("'order'") && q.includes("order_status")) {
      this.db.audits.push({ id: v[0], actor_admin_id: v[1], action: v[2], entity_type: "order", entity_id: v[3], metadata_json: v[4] });
      return { success: true, meta: { changes: 1 } };
    }
    if (q.startsWith("INSERT INTO audit_logs")) {
      const literalAction = q.match(/,\s*'([a-z][a-z0-9_.-]+)'\s*,\s*'/i)?.[1];
      const action = literalAction || v[2] || "";
      const entry = {
        id: v[0] ?? null,
        actor_admin_id: v[1] ?? null,
        action,
        entity_type: v[3] ?? null,
        entity_id: v[4] ?? v[1] ?? null,
        metadata_json: v[5] ?? v[3] ?? null,
        values: v,
        2: action,
        includes: (needle) => q.includes(String(needle)) || v.some(value => String(value ?? "").includes(String(needle))),
      };
      this.db.audits.push(entry);
      return { success: true, meta: { changes: 1 } };
    }
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
  customers = new Map();
  customerSessions = new Map();
  orderStatusEvents = [];
  admins = new Map();
  sessions = new Map();
  posCashiers = new Map();
  aiKeys = new Map();
  failAiKeyRead = false;
  attempts = new Map();
  paymentAttempts = new Map();
  financialAccounts = new Map([
    ["cash-main",{id:"cash-main",name:"Main cash drawer",kind:"cash",masked_reference:"",is_active:1,opening_balance_paisa:0}],
    ["bank-clearing",{id:"bank-clearing",name:"Bank transfer clearing",kind:"bank",masked_reference:"",is_active:1,opening_balance_paisa:0}],
    ["wallet-clearing",{id:"wallet-clearing",name:"Mobile wallet clearing",kind:"wallet",masked_reference:"",is_active:1,opening_balance_paisa:0}],
    ["gateway-clearing",{id:"gateway-clearing",name:"Online payment clearing",kind:"gateway",masked_reference:"",is_active:1,opening_balance_paisa:0}],
  ]);
  financialTransactions = [];
  paymentWebhookEvents = new Map();
  returnRequests = new Map();
  exchangeRequests = new Map();
  returnRequestItems = [];
  returnStatusEvents = [];
  rateLimits = new Map();
  products = new Map();
  variants = new Map();
  movements = [];
  lastChanges = 0;
  enquiries = new Map();
  orders = new Map();
  orderItems = [];
  orderInventoryReservations = new Map();
  wholesaleQuotes = new Map();
  wholesaleQuoteItems = [];
  vehicles = new Map();
  rentalRequests = new Map();
  rentalDocuments = new Map();
  audits = [];
  notifications = new Map();
  notificationOutbox = new Map();
  enquiryEmailQueue = new Map();
  posSales = new Map();
  posReceiptOutbox = new Map();
  storeSettings = new Map();
  mediaAssets = new Map();
  productMediaAssets = new Map();
  mediaObjects = new Map();
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

const env = (db, token = "test-bootstrap-token-with-more-than-32-characters") => ({ DB: db, MEDIA: {
  put: async (key, body, options={}) => db.mediaObjects.set(key,{body,customMetadata:options.customMetadata||{},httpMetadata:options.httpMetadata||{}}),
  delete: async key => db.mediaObjects.delete(key),
  head: async key => { const item=db.mediaObjects.get(key); return item?{customMetadata:item.customMetadata}:null; },
  get: async key => db.mediaObjects.get(key)??null
}, ADMIN_BOOTSTRAP_TOKEN: token });
const origin = "https://deverve.example";
const request = (path, method, body, headers = {}) => {
  const protectedPublicWrite = path === "/api/enquiries" || path === "/api/orders" || path === "/api/rentals" || path === "/api/customer/register";
  const payload = protectedPublicWrite && body && typeof body === "object"
    ? { ...body, turnstile_token: body.turnstile_token ?? "test-valid-token" }
    : body;
  return new Request(origin + path, {
    method,
    headers: { origin, "content-type": "application/json", ...headers },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
};
const bootstrap = (db, overrides = {}) => handleRequest(request("/api/admin/bootstrap", "POST", {
  bootstrapToken: "test-bootstrap-token-with-more-than-32-characters",
  email: "owner@deverve.example",
  password: "A-strong-password-2026",
  ...overrides,
}), env(db));
const customerSession = async (db, email = "buyer@example.com") => {
  const response = await handleRequest(request("/api/customer/register", "POST", {
    full_name: "Browser Buyer", phone: "+923001234567", email,
    password: "A-strong-customer-password-2026", turnstile_token: "test-valid-token",
  }, { "cf-connecting-ip": "203.0.113.199", "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(response.status, 201);
  return response.headers.get("set-cookie").split(";")[0];
};
const login = (db, password) => handleRequest(request("/api/admin/login", "POST", {
  email: "owner@deverve.example", password,
}, { "cf-connecting-ip": "203.0.113.10", "sec-fetch-site": "same-origin" }), env(db));

test("system health is owner-only and never returns provider secret values", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const response = await handleRequest(request("/api/admin/system-health","GET",undefined,{cookie}),{
    ...env(db),RESEND_API_KEY:"never-return-this-secret",RESEND_FROM_EMAIL:"alerts@deverve.example",
    SAFEPAY_SECRET_KEY:"another-never-return-secret",SAFEPAY_MERCHANT_API_KEY:"merchant-secret",SAFEPAY_WEBHOOK_SECRET:"webhook-secret",
  });
  assert.equal(response.status,200);
  const payload = await response.json();
  assert.equal(payload.database.status,"connected");
  assert.equal(payload.providers.email.configured,true);
  assert.equal(payload.overall_status,"partial");
  const serialized=JSON.stringify(payload);
  assert.doesNotMatch(serialized,/never-return-this-secret|another-never-return-secret|merchant-secret|webhook-secret/);
  db.admins.get([...db.admins.keys()][0]).role="manager";
  const denied=await handleRequest(request("/api/admin/system-health","GET",undefined,{cookie}),env(db));
  assert.equal(denied.status,403);
});

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
  assert.equal((await handleRequest(request("/api/admin/bootstrap", "POST", {}), { DB: db })).status, 503);
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

test("owner can create, edit, publish and archive products with an audit entry", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const created = await handleRequest(request("/api/admin/products", "POST", {
    name: "Everyday Hoodie", category: "hoodies", audience: "unisex", retail_price_paisa: 250000,
  }, headers), env(db));
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  const id = createdBody.id;
  assert.equal(createdBody.product.slug, "everyday-hoodie");
  assert.equal(db.audits.length, 1);

  const updated = await handleRequest(request("/api/admin/products/" + id, "PATCH", {
    name: "Everyday Premium Hoodie", status: "published",
  }, headers), env(db));
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).product.status, "published");

  const listed = await handleRequest(new Request(origin + "/api/admin/products?status=published&limit=1&offset=0", { headers: { cookie } }), env(db));
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.products.length, 1);
  assert.equal(listedBody.has_more, false);
  assert.equal(listedBody.next_offset, 1);
  const nextPage = await handleRequest(new Request(origin + "/api/admin/products?status=published&limit=1&offset=1", { headers: { cookie } }), env(db));
  assert.equal((await nextPage.json()).products.length, 0);

  const archived = await handleRequest(request("/api/admin/products/" + id, "DELETE", {}, headers), env(db));
  assert.equal(archived.status, 200);
  assert.equal(db.products.get(id).status, "archived");
  assert.equal(db.audits.length, 3);
});

test("owner bulk publishing is all-or-none and requires a real cover image plus available stock", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const makeProduct = (id, name) => ({ id, slug: name.toLowerCase(), name, description: "", category: "Hoodies", audience: "unisex", status: "draft", retail_price_paisa: 250000, wholesale_price_paisa: null });
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  for (const [index, id] of ids.entries()) {
    db.products.set(id, makeProduct(id, "Bulk Hoodie " + index));
    db.variants.set("variant-" + index, { id: "variant-" + index, product_id: id, is_active: 1, stock_on_hand: 5, reserved_quantity: 0 });
    const mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".replace("aaaa", index === 0 ? "aaaa" : "bbbb");
    db.mediaAssets.set(mediaId, { id: mediaId, media_type: "image", status: "ready" });
    if (index === 0) db.productMediaAssets.set("media-link-" + index, { product_id: id, media_asset_id: mediaId, color: "", is_primary: 1 });
  }
  const rejected = await handleRequest(request("/api/admin/products/publish-bulk", "POST", { product_ids: ids }, headers), env(db));
  assert.equal(rejected.status, 409);
  assert.equal(db.products.get(ids[0]).status, "draft", "eligible product must not be partially published");
  assert.equal(db.products.get(ids[1]).status, "draft", "ineligible product remains a draft");
  assert.equal(db.audits.filter(row => row.action === "product.bulk_published").length, 0);

  const secondMedia = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  db.productMediaAssets.set("media-link-1", { product_id: ids[1], media_asset_id: secondMedia, color: "", is_primary: 1 });
  db.mediaAssets.set(secondMedia, { id: secondMedia, media_type: "image", status: "ready" });
  const published = await handleRequest(request("/api/admin/products/publish-bulk", "POST", { product_ids: ids }, headers), env(db));
  assert.equal(published.status, 200);
  assert.equal((await published.json()).published, 2);
  assert.equal(db.products.get(ids[0]).status, "published");
  assert.equal(db.products.get(ids[1]).status, "published");
  assert.equal(db.audits.filter(row => row.action === "product.bulk_published").length, 1);
});

test("catalogue staff cannot publish or archive products", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const created = await handleRequest(request("/api/admin/products", "POST", {
    name: "Staff Draft Hoodie", category: "hoodies", audience: "unisex",
  }, headers), env(db));
  assert.equal(created.status, 201);
  const id = (await created.json()).id;
  const admin = [...db.admins.values()][0];
  admin.role = "catalogue";

  const publish = await handleRequest(request("/api/admin/products/" + id, "PATCH", { status: "published" }, headers), env(db));
  assert.equal(publish.status, 403);
  const archive = await handleRequest(request("/api/admin/products/" + id, "DELETE", {}, headers), env(db));
  assert.equal(archive.status, 403);
  const bulkPublish = await handleRequest(request("/api/admin/products/publish-bulk", "POST", { product_ids: [id] }, headers), env(db));
  assert.equal(bulkPublish.status, 403);
  assert.equal(db.products.get(id).status, "draft");
});

test("duplicate product slugs are rejected without a second insert", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const payload = { name: "Classic Sweatshirt", category: "sweatshirts", audience: "unisex" };
  assert.equal((await handleRequest(request("/api/admin/products", "POST", payload, headers), env(db))).status, 201);
  const duplicate = await handleRequest(request("/api/admin/products", "POST", payload, headers), env(db));
  assert.equal(duplicate.status, 409);
  assert.equal(db.products.size, 1);
});

test("owner can review enquiries and change status with an audit trail", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const enquiry = {
    id: "e2f4a6b8-1234-4abc-9def-123456789abc",
    enquiry_type: "wholesale", customer_name: "Test Buyer", phone: "+923001234567",
    email: "buyer@example.com", message: "Please share your wholesale rates.",
    status: "new", source: "website", created_at: new Date().toISOString(),
  };
  db.enquiries.set(enquiry.id, { ...enquiry });

  const listed = await handleRequest(new Request(origin + "/api/admin/enquiries?limit=50", { headers: { cookie } }), env(db));
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).enquiries[0].customer_name, "Test Buyer");

  const updated = await handleRequest(request("/api/admin/enquiries/" + enquiry.id, "PATCH", { status: "contacted" }, headers), env(db));
  assert.equal(updated.status, 200);
  assert.equal(db.enquiries.get(enquiry.id).status, "contacted");
  assert.equal(db.audits.length, 1);
});

test("rental staff can only update rental enquiries and viewers cannot update enquiries", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const id = "a2f4a6b8-1234-4abc-9def-123456789abc";
  db.enquiries.set(id, { id, enquiry_type: "wholesale", status: "new" });
  const rentalId = "b2f4a6b8-1234-4abc-9def-123456789abc";
  db.enquiries.set(rentalId, { id: rentalId, enquiry_type: "rental", status: "new" });
  [...db.admins.values()][0].role = "rental";

  const rentalList = await handleRequest(new Request(origin + "/api/admin/enquiries", { headers: { cookie } }), env(db));
  assert.equal(rentalList.status, 200);
  assert.deepEqual((await rentalList.json()).enquiries.map((item) => item.id), [rentalId]);

  const blocked = await handleRequest(request("/api/admin/enquiries/" + id, "PATCH", { status: "contacted" }, headers), env(db));
  assert.equal(blocked.status, 403);
  [...db.admins.values()][0].role = "viewer";
  const viewer = await handleRequest(request("/api/admin/enquiries/" + id, "PATCH", { status: "closed" }, headers), env(db));
  assert.equal(viewer.status, 403);
});

test("owner can create variants and record stock movements without allowing negative inventory", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const productResponse = await handleRequest(request("/api/admin/products", "POST", {
    name: "Stretch Hoodie", category: "hoodies", audience: "unisex",
  }, headers), env(db));
  const productId = (await productResponse.json()).id;

  const created = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", {
    sku: "dv-hood-blk-m", size: "M", color: "Black", initial_stock: 10,
  }, headers), env(db));
  assert.equal(created.status, 201);
  const variant = (await created.json()).variant;
  assert.equal(variant.sku, "DV-HOOD-BLK-M");
  assert.equal(db.variants.get(variant.id).stock_on_hand, 10);
  assert.equal(db.movements[0].movement_type, "opening");

  const received = await handleRequest(request("/api/admin/variants/" + variant.id + "/stock", "POST", {
    movement_type: "received", quantity_delta: 5, note: "Supplier delivery",
  }, headers), env(db));
  assert.equal(received.status, 200);
  assert.equal((await received.json()).stock_on_hand, 15);

  const adjustment = await handleRequest(request("/api/admin/variants/" + variant.id + "/stock", "POST", {
    movement_type: "adjustment", quantity_delta: -3, note: "Damaged items removed",
  }, headers), env(db));
  assert.equal(adjustment.status, 200);
  assert.equal((await adjustment.json()).stock_on_hand, 12);

  const negative = await handleRequest(request("/api/admin/variants/" + variant.id + "/stock", "POST", {
    movement_type: "adjustment", quantity_delta: -20, note: "Invalid count",
  }, headers), env(db));
  assert.equal(negative.status, 409);
  assert.equal(db.variants.get(variant.id).stock_on_hand, 12);
  assert.equal(db.movements.length, 3);
  const history = await handleRequest(new Request(origin + "/api/admin/variants/" + variant.id + "/movements", { headers: { cookie } }), env(db));
  assert.equal(history.status, 200);
  assert.equal((await history.json()).movements.length, 3);
});

test("bulk size-colour variant creation is atomic, records opening stock and blocks duplicates or unsafe legacy stock", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const productResponse = await handleRequest(request("/api/admin/products", "POST", {
    name: "Matrix Hoodie", category: "hoodies", audience: "unisex",
  }, headers), env(db));
  const productId = (await productResponse.json()).id;
  const payload = { variants: [
    { size: "M", color: "Black", initial_stock: 4, reorder_level: 2 },
    { size: "L", color: "Black", initial_stock: 3, reorder_level: 2 },
  ] };
  const created = await handleRequest(request("/api/admin/products/" + productId + "/variants/bulk", "POST", payload, headers), env(db));
  assert.equal(created.status, 201);
  const result = await created.json();
  assert.equal(result.created, 2);
  assert.equal(result.atomic, true);
  assert.equal(db.variants.size, 2);
  assert.equal(db.movements.length, 2);
  assert.deepEqual([...db.variants.values()].map(row => row.stock_on_hand).sort(), [3,4]);

  const duplicate = await handleRequest(request("/api/admin/products/" + productId + "/variants/bulk", "POST", payload, headers), env(db));
  assert.equal(duplicate.status, 409);
  assert.equal(db.variants.size, 2);

  db.variants.set("legacy-variant", { id:"legacy-variant", product_id:productId, sku:"LEGACY-MULTI", size:"S, M", color:"Black, White", stock_on_hand:12, reserved_quantity:0, is_active:1 });
  const blocked = await handleRequest(request("/api/admin/products/" + productId + "/variants/bulk", "POST", {
    variants:[{size:"S",color:"Black",initial_stock:6,reorder_level:2}]
  }, headers), env(db));
  assert.equal(blocked.status, 409);
  assert.equal(db.variants.size, 3);
});

test("catalogue staff cannot change stock quantities", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const product = await handleRequest(request("/api/admin/products", "POST", { name: "Basic Tee", category: "t-shirts", audience: "unisex" }, headers), env(db));
  const productId = (await product.json()).id;
  const created = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", { size: "L", color: "White" }, headers), env(db));
  const variantId = (await created.json()).variant.id;
  [...db.admins.values()][0].role = "catalogue";
  const denied = await handleRequest(request("/api/admin/variants/" + variantId + "/stock", "POST", { movement_type: "received", quantity_delta: 3, note: "Supplier delivery" }, headers), env(db));
  assert.equal(denied.status, 403);
  assert.equal(db.variants.get(variantId).stock_on_hand, 0);
});


test("COD checkout verifies live price, reserves stock once, and fulfils orders through the admin workflow", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const customerCookie = await customerSession(db, "checkout-buyer@example.com");
  const customerHeaders = { cookie: customerCookie, "sec-fetch-site": "same-origin" };
  const productResponse = await handleRequest(request("/api/admin/products", "POST", {
    name: "Checkout Hoodie", category: "hoodies", audience: "unisex", retail_price_paisa: 250000,
  }, headers), env(db));
  const productId = (await productResponse.json()).id;
  await handleRequest(request("/api/admin/products/" + productId, "PATCH", { status: "published" }, headers), env(db));
  const variantResponse = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", {
    sku: "DV-CHECKOUT-M", size: "M", color: "Navy", initial_stock: 5,
  }, headers), env(db));
  const variantId = (await variantResponse.json()).variant.id;
  const soldOutVariantId = crypto.randomUUID();
  db.variants.set(soldOutVariantId, { id: soldOutVariantId, product_id: productId, sku: "DV-CHECKOUT-S", size: "S", color: "Navy", stock_on_hand: 0, reserved_quantity: 0, is_active: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

  const catalogue = await handleRequest(new Request(origin + "/api/products?limit=12"), env(db));
  assert.equal(catalogue.status, 200);
  const publicVariants = (await catalogue.json()).products[0].variants;
  assert.equal(publicVariants.length, 2, "sold-out sizes remain visible as disabled customer choices");
  assert.equal(publicVariants.find((variant) => variant.sku === "DV-CHECKOUT-M").available_quantity, 5);
  assert.equal(publicVariants.find((variant) => variant.sku === "DV-CHECKOUT-S").available_quantity, 0);

  const payload = {
    checkout_token: "123e4567-e89b-42d3-a456-426614174000",
    customer_name: "Test Buyer", phone: "+923001234567", email: "buyer@example.com",
    delivery_address: "House 10, Street 2, Model Town", city: "Jhelum", customer_note: "",
    items: [{ variant_id: variantId, quantity: 1 }, { variant_id: variantId, quantity: 1 }],
  };
  const placed = await handleRequest(request("/api/orders", "POST", payload, customerHeaders), env(db));
  assert.equal(placed.status, 201);
  const placedBody = await placed.json();
  assert.match(placedBody.order_number, /^DV-/);
  assert.equal(placedBody.total_paisa, 500000);
  assert.equal(db.variants.get(variantId).stock_on_hand, 5);
  assert.equal(db.variants.get(variantId).reserved_quantity, 2);
  assert.equal(db.orders.size, 1);
  const checkoutOrderId = [...db.orders.keys()][0];
  const checkoutReservation = db.orderInventoryReservations.get(checkoutOrderId + ":" + variantId);
  assert.equal(checkoutReservation.quantity, 2);
  assert.equal(checkoutReservation.status, "reserved");

  const duplicate = await handleRequest(request("/api/orders", "POST", payload, customerHeaders), env(db));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(db.orders.size, 1);
  assert.equal(db.variants.get(variantId).reserved_quantity, 2);

  const unavailable = await handleRequest(request("/api/orders", "POST", {
    ...payload, checkout_token: "123e4567-e89b-42d3-a456-426614174001", items: [{ variant_id: variantId, quantity: 10 }],
  }, customerHeaders), env(db));
  assert.equal(unavailable.status, 409);
  assert.equal(db.orders.size, 1);

  const listed = await handleRequest(new Request(origin + "/api/admin/orders", { headers: { cookie } }), env(db));
  assert.equal(listed.status, 200);
  const order = (await listed.json()).orders[0];
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.delivery_fee_status, "pending_quote");

  const deliveryQuote = await handleRequest(request("/api/admin/orders/" + order.id + "/delivery-fee", "POST", { delivery_fee_paisa: 0 }, headers), env(db));
  assert.equal(deliveryQuote.status, 200);
  const deliveryToken = new URL((await deliveryQuote.json()).approval_url).searchParams.get("token");
  const deliveryAccepted = await handleRequest(request("/api/delivery-fee/" + deliveryToken, "POST", { decision: "accept" }, { "cf-connecting-ip": "203.0.113.57" }), env(db));
  assert.equal(deliveryAccepted.status, 200);

  for (const status of ["confirmed", "processing"]) {
    const updated = await handleRequest(request("/api/admin/orders/" + order.id, "PATCH", { order_status: status }, headers), env(db));
    assert.equal(updated.status, 200);
  }
  db.orderItems.push({ id: crypto.randomUUID(), order_id: order.id, variant_id: variantId, quantity: 1 });
  const blockedDispatch = await handleRequest(request("/api/admin/orders/" + order.id, "PATCH", { order_status: "dispatched" }, headers), env(db));
  assert.equal(blockedDispatch.status, 409, "duplicate order lines must be checked as one combined reservation");
  assert.equal(db.variants.get(variantId).stock_on_hand, 5);
  db.variants.get(variantId).reserved_quantity = 3;
  const dispatched = await handleRequest(request("/api/admin/orders/" + order.id, "PATCH", { order_status: "dispatched" }, headers), env(db));
  assert.equal(dispatched.status, 200);
  const delivered = await handleRequest(request("/api/admin/orders/" + order.id, "PATCH", { order_status: "delivered" }, headers), env(db));
  assert.equal(delivered.status, 200);
  assert.equal(db.variants.get(variantId).stock_on_hand, 2);
  assert.equal(db.variants.get(variantId).reserved_quantity, 0);
  assert.equal(db.movements.at(-1).movement_type, "sold");
  assert.equal(db.movements.at(-1).quantity_delta, -3);
  assert.equal(db.orderInventoryReservations.get(order.id + ":" + variantId).status, "consumed");
});

test("cancelling a COD order releases its reservation without changing physical stock", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const customerCookie = await customerSession(db, "cancel-buyer@example.com");
  const customerHeaders = { cookie: customerCookie, "sec-fetch-site": "same-origin" };
  const product = await handleRequest(request("/api/admin/products", "POST", {
    name: "Cancel Test Tee", category: "t-shirts", audience: "unisex", retail_price_paisa: 120000,
  }, headers), env(db));
  const productId = (await product.json()).id;
  await handleRequest(request("/api/admin/products/" + productId, "PATCH", { status: "published" }, headers), env(db));
  const variant = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", {
    sku: "DV-CANCEL-L", size: "L", color: "White", initial_stock: 4,
  }, headers), env(db));
  const variantId = (await variant.json()).variant.id;
  const placed = await handleRequest(request("/api/orders", "POST", {
    checkout_token: "123e4567-e89b-42d3-a456-426614174002",
    customer_name: "Cancel Buyer", phone: "+923001234567", delivery_address: "House 10, Street 2", city: "Jhelum",
    items: [{ variant_id: variantId, quantity: 3 }],
  }, customerHeaders), env(db));
  assert.equal(placed.status, 201);
  const orderId = [...db.orders.keys()][0];
  db.orderItems.push({ id: crypto.randomUUID(), order_id: orderId, variant_id: variantId, quantity: 1 });
  const blocked = await handleRequest(request("/api/admin/orders/" + orderId, "PATCH", { order_status: "cancelled" }, headers), env(db));
  assert.equal(blocked.status, 409, "admin cancellation must guard the combined quantity across duplicate order lines");
  assert.equal(db.variants.get(variantId).reserved_quantity, 3);
  db.variants.get(variantId).reserved_quantity = 4;
  const cancelled = await handleRequest(request("/api/admin/orders/" + orderId, "PATCH", { order_status: "cancelled" }, headers), env(db));
  assert.equal(cancelled.status, 200);
  assert.equal(db.variants.get(variantId).stock_on_hand, 4);
  assert.equal(db.variants.get(variantId).reserved_quantity, 0);
  assert.equal(db.orderInventoryReservations.get(orderId + ":" + variantId).status, "released");
});

test("admin cannot cancel an online-paid order or one with an active Safepay payment session", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const orderId = crypto.randomUUID();
  db.orders.set(orderId, {
    id: orderId, order_number: "DV-SAFEPAY-GUARD", payment_provider: "safepay",
    payment_status: "pending", order_status: "pending", delivery_fee_status: "pending_quote",
  });
  db.paymentAttempts.set("attempt-active", {
    id: "attempt-active", order_id: orderId, provider: "safepay", status: "pending",
  });
  const active = await handleRequest(request("/api/admin/orders/" + orderId, "PATCH", { order_status: "cancelled" }, headers), env(db));
  assert.equal(active.status, 409);
  assert.equal(db.orders.get(orderId).order_status, "pending");

  db.paymentAttempts.clear();
  db.orders.get(orderId).payment_status = "paid";
  const paid = await handleRequest(request("/api/admin/orders/" + orderId, "PATCH", { order_status: "cancelled" }, headers), env(db));
  assert.equal(paid.status, 409);
  assert.equal(db.orders.get(orderId).order_status, "pending");
});

test("wholesale quotation can be sent, customer-approved and converted once into a stock-reserved COD order", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const buyerCookie = await customerSession(db, "wholesale-buyer@example.com");
  const buyerMe = await handleRequest(request("/api/customer/me", "GET", undefined, { cookie: buyerCookie }), env(db));
  assert.equal(buyerMe.status, 200);
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const productResponse = await handleRequest(request("/api/admin/products", "POST", {
    name: "Wholesale Hoodie", category: "hoodies", audience: "unisex", status: "published",
    retail_price_paisa: 300000, wholesale_price_paisa: 200000,
  }, headers), env(db));
  const productId = (await productResponse.json()).id;
  await handleRequest(request("/api/admin/products/" + productId, "PATCH", { status: "published" }, headers), env(db));
  const variantResponse = await handleRequest(request("/api/admin/products/" + productId + "/variants", "POST", {
    sku: "DV-WHOLESALE-M", size: "M", color: "Navy", initial_stock: 30,
  }, headers), env(db));
  const variantId = (await variantResponse.json()).variant.id;
  const created = await handleRequest(request("/api/admin/wholesale-quotes", "POST", {
    business_name: "Test Retail Store", contact_name: "Wholesale Buyer", phone: "+923001234567",
    email: "buyer@example.com", delivery_address: "Shop 12, Main Market", city: "Jhelum",
    valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
    items: [{ variant_id: variantId, quantity: 6, unit_price_paisa: 185000 }],
  }, headers), env(db));
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  const quoteId = createdBody.quote_id;
  const quote = db.wholesaleQuotes.get(quoteId);
  const originalQuoteLine = db.wholesaleQuoteItems[0];
  db.wholesaleQuoteItems.push({ ...originalQuoteLine, id: crypto.randomUUID(), quantity: 6, line_total_paisa: 1110000 });
  quote.quoted_total_paisa = 2220000;
  assert.equal(quote.quoted_total_paisa, 2220000);
  assert.equal(quote.status, "prepared");
  assert.equal(db.wholesaleQuoteItems.length, 2, "legacy duplicate quote lines are retained and aggregated safely during conversion");
  const sent = await handleRequest(request("/api/admin/wholesale-quotes/" + quoteId, "PATCH", { status: "sent" }, headers), env(db));
  assert.equal(sent.status, 200);
  const publicUrl = "/api/wholesale-quotes/" + quote.approval_token;
  const view = await handleRequest(new Request(origin + publicUrl), env(db));
  assert.equal(view.status, 200);
  assert.equal((await view.json()).quote.items[0].quantity, 6);
  assert.equal(db.variants.get(variantId).reserved_quantity, 0);
  const guestAccept = await handleRequest(request(publicUrl + "/accept", "POST", {}, { "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(guestAccept.status, 401);
  db.variants.get(variantId).stock_on_hand = 10;
  const insufficientCombined = await handleRequest(request(publicUrl + "/accept", "POST", {}, { cookie: buyerCookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(insufficientCombined.status, 409, "duplicate wholesale lines must be checked against their combined quantity");
  assert.equal(db.orders.size, 0);
  assert.equal(db.variants.get(variantId).reserved_quantity, 0);
  db.variants.get(variantId).stock_on_hand = 30;
  const accepted = await handleRequest(request(publicUrl + "/accept", "POST", {}, { cookie: buyerCookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(accepted.status, 201);
  const acceptedBody = await accepted.json();
  assert.match(acceptedBody.order.order_number, /^DV-W-/);
  assert.equal(db.orders.size, 1);
  assert.equal(db.wholesaleQuotes.get(quoteId).status, "accepted");
  assert.equal(db.variants.get(variantId).reserved_quantity, 12);
  const order = [...db.orders.values()][0];
  const wholesaleReservation = db.orderInventoryReservations.get(order.id + ":" + variantId);
  assert.equal(wholesaleReservation.quantity, 12, "duplicate quote lines must create one aggregated reservation ledger row");
  assert.equal(wholesaleReservation.status, "reserved");
  assert.equal(order.phone, "+923001234567");
  assert.equal(order.delivery_address, "Shop 12, Main Market");
  assert.equal(order.total_paisa, 2220000);
  const duplicate = await handleRequest(request(publicUrl + "/accept", "POST", {}, { cookie: buyerCookie, "sec-fetch-site": "same-origin" }), env(db));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).accepted, true);
  assert.equal(db.orders.size, 1);
  assert.equal(db.variants.get(variantId).reserved_quantity, 12);
});

test("rental submission requires both CNIC images, calculates driver-specific pricing and blocks unverified confirmation", async () => {
  const db = new FakeD1();
  db.storeSettings.set("cnic_uploads_enabled", { setting_value_json: "false" });
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "sec-fetch-site": "same-origin" };
  const customerCookie = await customerSession(db, "rental-buyer@example.com");
  const createVehicle = async (name, selfRate, driverRate) => {
    const response = await handleRequest(request("/api/admin/vehicles", "POST", {
      name, vehicle_type: "Sedan", transmission: "Automatic", seats: 5, fuel_type: "Petrol",
      daily_rate_paisa: selfRate, with_driver_daily_rate_paisa: driverRate,
      status: "available", description: "Test fleet vehicle",
    }, headers), env(db));
    assert.equal(response.status, 201);
    return (await response.json()).vehicle_id;
  };
  const vehicleOne = await createVehicle("Fleet Sedan One", 850000, 1200000);
  const vehicleTwo = await createVehicle("Fleet Sedan Two", 800000, 1300000);
  const fleet = await handleRequest(new Request(origin + "/api/vehicles"), env(db));
  assert.equal(fleet.status, 200);
  const publicFleet = (await fleet.json()).vehicles;
  assert.equal(publicFleet.length, 2);
  assert.equal(publicFleet.find((v) => v.id === vehicleOne).with_driver_daily_rate_paisa, 1200000);

  const pickup = new Date(Date.now() + 2 * 86400000).toISOString();
  const returning = new Date(Date.parse(pickup) + 86400000).toISOString();
  const makeForm = (vehicleId, customerName, driver = "with_driver", includeDocuments = true) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      vehicle_id: vehicleId, customer_name: customerName, phone: "+923001234567",
      email: "renter@example.com", pickup_city: "Jhelum", pickup_address: "House 10, Main Road, Satellite Town",
      destination_city: "Islamabad", destination_address: "Blue Area, Islamabad",
      pickup_at: pickup, return_at: returning, driver_option: driver, customer_note: "",
      turnstile_token: "test-valid-token", cnic_consent: "true", cnic_consent_version: "rental-cnic-2026-11-21-v1",
    })) form.append(key, value);
    if (includeDocuments) {
      const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
      form.append("cnic_front", new File([png], "front.png", { type: "image/png" }));
      form.append("cnic_back", new File([png], "back.png", { type: "image/png" }));
    }
    return form;
  };
  const sendForm = (form) => handleRequest(new Request(origin + "/api/rentals", {
    method: "POST", headers: { origin, cookie: customerCookie, "cf-connecting-ip": "203.0.113.122", "sec-fetch-site": "same-origin" }, body: form,
  }), env(db));

  const missingDocuments = await sendForm(makeForm(vehicleOne, "Missing CNIC", "with_driver", false));
  assert.equal(missingDocuments.status, 400);
  assert.equal(db.rentalRequests.size, 0);

  const missingNoticeVersion = makeForm(vehicleOne, "Missing notice version");
  missingNoticeVersion.delete("cnic_consent_version");
  const unversionedConsent = await sendForm(missingNoticeVersion);
  assert.equal(unversionedConsent.status, 400);
  assert.equal(db.rentalRequests.size, 0);

  const first = await sendForm(makeForm(vehicleOne, "Rental Customer", "with_driver"));
  assert.equal(first.status, 201);
  const firstPayload = await first.json();
  assert.equal(firstPayload.rental_days, 1);
  assert.equal(firstPayload.estimated_daily_rate_paisa, 1200000);
  assert.equal(firstPayload.estimated_total_paisa, 1200000);
  const firstId = [...db.rentalRequests.keys()][0];
  assert.equal([...db.rentalDocuments.values()].filter((doc) => doc.rental_request_id === firstId).length, 2);
  assert.equal(db.rentalRequests.get(firstId).estimated_total_paisa, 1200000);
  assert.equal(db.rentalRequests.get(firstId).cnic_consent_version, "rental-cnic-2026-11-21-v1");
  assert.ok(db.rentalRequests.get(firstId).cnic_consent_at);
  assert.equal(db.audits.find(row => row.action === "rental.created_with_cnic").values[2].includes("cnic_consent_version"), true);
  const privateDocument = await handleRequest(new Request(origin + "/api/admin/rentals/" + firstId + "/documents/cnic_front"), env(db));
  assert.equal(privateDocument.status, 401);

  const legacyId = crypto.randomUUID();
  db.rentalRequests.set(legacyId, { id: legacyId, vehicle_id: null, pickup_at: pickup, return_at: returning, status: "requested" });
  const legacyReview = await handleRequest(request("/api/admin/rentals/" + legacyId, "PATCH", { status: "reviewing", vehicle_id: null }, headers), env(db));
  assert.equal(legacyReview.status, 200, await legacyReview.clone().text());
  const legacyConfirm = await handleRequest(request("/api/admin/rentals/" + legacyId, "PATCH", { status: "confirmed", vehicle_id: null }, headers), env(db));
  assert.equal(legacyConfirm.status, 409);
  assert.match((await legacyConfirm.json()).error, /both CNIC images/i);

  const second = await sendForm(makeForm(vehicleTwo, "Second Customer", "self_drive"));
  assert.equal(second.status, 201);
  const secondPayload = await second.json();
  assert.equal(secondPayload.estimated_daily_rate_paisa, 800000);
  assert.equal(secondPayload.estimated_total_paisa, 800000);
  const secondId = [...db.rentalRequests.keys()][2];

  const reviewingFirst = await handleRequest(request("/api/admin/rentals/" + firstId, "PATCH", { status: "reviewing", vehicle_id: vehicleOne }, headers), env(db));
  assert.equal(reviewingFirst.status, 200);
  const confirmedFirst = await handleRequest(request("/api/admin/rentals/" + firstId, "PATCH", { status: "confirmed", vehicle_id: vehicleOne }, headers), env(db));
  assert.equal(confirmedFirst.status, 200);

  await handleRequest(request("/api/admin/rentals/" + secondId, "PATCH", { status: "reviewing", vehicle_id: vehicleOne }, headers), env(db));
  const conflict = await handleRequest(request("/api/admin/rentals/" + secondId, "PATCH", { status: "confirmed", vehicle_id: vehicleOne }, headers), env(db));
  assert.equal(conflict.status, 409);
  const reassigned = await handleRequest(request("/api/admin/rentals/" + secondId, "PATCH", { status: "confirmed", vehicle_id: vehicleTwo }, headers), env(db));
  assert.equal(reassigned.status, 200);
  assert.equal(db.rentalRequests.get(firstId).status, "confirmed");
  assert.equal(db.rentalRequests.get(secondId).vehicle_id, vehicleTwo);
  assert.equal(db.rentalRequests.get(secondId).status, "confirmed");
  const savedRentalDetails = await handleRequest(request("/api/admin/rentals/" + secondId, "PATCH", {
    status: "confirmed", vehicle_id: vehicleTwo, admin_note: "Vehicle assignment checked and customer contacted.",
  }, headers), env(db));
  assert.equal(savedRentalDetails.status, 200);
  assert.equal(db.rentalRequests.get(secondId).admin_note, "Vehicle assignment checked and customer contacted.");
});



test("owner notifications are private, readable and can be marked as read", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const unauthenticated = await handleRequest(new Request(origin + "/api/admin/notifications"), env(db));
  assert.equal(unauthenticated.status, 401);
  db.notifications.set("123e4567-e89b-42d3-a456-426614174000", { id:"123e4567-e89b-42d3-a456-426614174000", event_type:"order.created", title:"New order DV-TEST", body:"Review order status.", entity_type:"order", entity_id:"order-1", is_read:0, created_at:new Date().toISOString(), read_at:null });
  const list = await handleRequest(new Request(origin + "/api/admin/notifications", { headers:{cookie} }), env(db));
  assert.equal(list.status, 200);
  assert.equal((await list.json()).unread, 1);
  const read = await handleRequest(request("/api/admin/notifications/123e4567-e89b-42d3-a456-426614174000/read","PATCH",{}, {cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(read.status,200);
  assert.equal(db.notifications.get("123e4567-e89b-42d3-a456-426614174000").is_read,1);
  const all = await handleRequest(request("/api/admin/notifications/read-all","POST",{}, {cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(all.status,200);
});


test("Safepay production credentials remain disabled until the explicit live switch is enabled", async () => {
  const base = { ...env(new FakeD1()), SAFEPAY_ENV:"production", SAFEPAY_MERCHANT_API_KEY:"production-public-key", SAFEPAY_SECRET_KEY:"production-secret", SAFEPAY_WEBHOOK_SECRET:"production-webhook-secret" };
  const disabled = await handleRequest(request("/api/storefront/payment-options","GET"),base);
  assert.deepEqual(await disabled.json(),{online_payment_available:false,environment:null,methods:[{id:"cod",label:"Cash on delivery",kind:"cod",provider:"",account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"Pay when your order is delivered.",qr_media_id:null}]});
  const enabled = await handleRequest(request("/api/storefront/payment-options","GET"),{...base,SAFEPAY_LIVE_ENABLED:"true"});
  assert.deepEqual(await enabled.json(),{online_payment_available:true,environment:"production",methods:[{id:"cod",label:"Cash on delivery",kind:"cod",provider:"",account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"Pay when your order is delivered.",qr_media_id:null}]});
});


test("Safepay checkout URL always matches the selected merchant environment", () => {
  const sandbox = buildSafepayCheckoutUrl({ apiHost: "https://sandbox.api.getsafepay.com", environment: "sandbox", merchantApiKey: "x", secretKey: "x", webhookSecret: "x" }, "track_test_123456789012", "sandbox-token-123456789012", "https://deverve.example");
  const live = buildSafepayCheckoutUrl({ apiHost: "https://api.getsafepay.com", environment: "production", merchantApiKey: "x", secretKey: "x", webhookSecret: "x" }, "track_live_123456789012", "live-token-123456789012", "https://deverve.example");
  assert.equal(new URL(sandbox).searchParams.get("environment"), "sandbox");
  assert.equal(new URL(sandbox).hostname, "sandbox.api.getsafepay.com");
  assert.equal(new URL(live).searchParams.get("environment"), "production");
  assert.equal(new URL(live).hostname, "api.getsafepay.com");
  assert.equal(new URL(live).searchParams.get("redirect_url"), "https://deverve.example/account?payment=return");
});


test("checkout never grants unconfigured spend or payment discounts", () => {
  const none = { code: "", label: "", discountPercent: 0, discountAmountPaisa: 0, freeDelivery: false };
  assert.deepEqual(selectOrderPromotion(500000, false), none);
  assert.deepEqual(selectOrderPromotion(500001, false), none);
  assert.deepEqual(selectOrderPromotion(2000001, false), none);
  assert.deepEqual(selectOrderPromotion(2500000, true), none);
  assert.deepEqual(selectOrderPromotion(4000001, true), none);
  assert.throws(() => selectOrderPromotion(-1, false), /Invalid order subtotal/);
});


test("staff can save internal notes on closed return and exchange records without reopening them", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const exchangeId = crypto.randomUUID();
  const returnId = crypto.randomUUID();
  db.exchangeRequests.set(exchangeId, { id: exchangeId, status: "completed", admin_note: "Old exchange note" });
  db.returnRequests.set(returnId, { id: returnId, status: "refunded", admin_note: "Old return note" });

  const exchange = await handleRequest(request("/api/admin/exchanges/" + exchangeId, "PATCH", { admin_note: "Replacement delivered and customer informed." }, { cookie, "sec-fetch-site": "same-origin" }), env(db));
  const returned = await handleRequest(request("/api/admin/returns/" + returnId, "PATCH", { admin_note: "Refund receipt archived with finance records." }, { cookie, "sec-fetch-site": "same-origin" }), env(db));

  assert.equal(exchange.status, 200, await exchange.clone().text());
  assert.equal(returned.status, 200, await returned.clone().text());
  assert.equal(db.exchangeRequests.get(exchangeId).status, "completed");
  assert.equal(db.exchangeRequests.get(exchangeId).admin_note, "Replacement delivered and customer informed.");
  assert.equal(db.returnRequests.get(returnId).status, "refunded");
  assert.equal(db.returnRequests.get(returnId).admin_note, "Refund receipt archived with finance records.");
});

test("exchange endpoints require authenticated customer and authorized staff sessions", async () => {
  const db = new FakeD1();
  const customer = await handleRequest(new Request(origin + "/api/customer/exchanges"), env(db));
  assert.equal(customer.status, 401);
  const admin = await handleRequest(new Request(origin + "/api/admin/exchanges"), env(db));
  assert.equal(admin.status, 401);
});


test("exchange eligibility uses the actual delivered status event, not later order edits", () => {
  const now = Date.parse("2026-11-15T12:00:00.000Z");
  assert.equal(isWithinExchangeWindow("2026-11-08T12:00:00.000Z", now), true);
  assert.equal(isWithinExchangeWindow("2026-11-08T11:59:59.999Z", now), false);
  assert.equal(isWithinExchangeWindow("2026-11-15T12:00:01.000Z", now), false);
  assert.equal(isWithinExchangeWindow(null, now), false);
  assert.equal(isWithinExchangeWindow("not-a-date", now), false);
});


test("owner can configure public direct payment methods and disabled options stay hidden", async () => {
  const db=new FakeD1();
  const setup=await bootstrap(db);
  const cookie=setup.headers.get("set-cookie").split(";")[0];
  const methods=[
    {id:"cod",label:"Cash on delivery",kind:"cod",provider:"",enabled:true,account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"Pay on delivery.",qr_media_id:null},
    {id:"meezan-bank",label:"Bank transfer",kind:"bank",provider:"Meezan Bank",enabled:true,account_title:"De VERVE",bank_name:"Meezan Bank",account_number:"1234567890",iban:"PK00TEST1234567890",payment_url:"",instructions:"Pay only after the final total is confirmed.",qr_media_id:null},
    {id:"sadapay",label:"SadaPay",kind:"wallet",provider:"SadaPay",enabled:true,account_title:"De VERVE",bank_name:"",account_number:"03197553705",iban:"",payment_url:"",instructions:"Use your order number as reference.",qr_media_id:null},
    {id:"hidden-payfast",label:"PayFast",kind:"link",provider:"PayFast",enabled:false,account_title:"",bank_name:"",account_number:"",iban:"",payment_url:"",instructions:"",qr_media_id:null}
  ];
  const saved=await handleRequest(request("/api/admin/settings","PATCH",{payment_methods:{methods}}, {cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(saved.status,200);
  const publicOptions=await handleRequest(request("/api/storefront/payment-options","GET"),env(db));
  assert.equal(publicOptions.status,200);
  const result=await publicOptions.json();
  assert.deepEqual(result.methods.map(item=>item.id),["cod","meezan-bank","sadapay"]);
  assert.equal(result.methods[1].account_number,"1234567890");
  assert.equal(result.methods.some(item=>item.id==="hidden-payfast"),false);
  [...db.admins.values()][0].role="manager";
  const denied=await handleRequest(request("/api/admin/settings","PATCH",{payment_methods:{methods}}, {cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(denied.status,403);
});


test("only the owner can verify a pending direct transfer and COD cannot be manually marked paid", async () => {
  const db=new FakeD1();
  const setup=await bootstrap(db);
  const cookie=setup.headers.get("set-cookie").split(";")[0];
  const transferId=crypto.randomUUID();
  db.orders.set(transferId,{id:transferId,order_number:"DV-DIRECT-VERIFY",payment_method:"sadapay",payment_provider:"manual",payment_status:"pending"});
  db.orders.get(transferId).order_status="confirmed";db.orders.get(transferId).total_paisa=250000;db.orders.get(transferId).financial_transaction_id=null;
  const verified=await handleRequest(request("/api/admin/orders/"+transferId,"PATCH",{payment_status:"paid",payment_reference:"BANK-REF-001",financial_account_id:"bank-clearing"},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(verified.status,200);
  assert.equal(db.orders.get(transferId).payment_status,"paid");
  assert.equal(db.audits.some(row=>JSON.stringify(row).includes("DV-DIRECT-VERIFY")),true);
  const codId=crypto.randomUUID();
  db.orders.set(codId,{id:codId,order_number:"DV-COD-VERIFY",payment_method:"cod",payment_provider:"manual",payment_status:"pending"});
  const rejected=await handleRequest(request("/api/admin/orders/"+codId,"PATCH",{payment_status:"paid",financial_account_id:"cash-main"},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(rejected.status,409);
  [...db.admins.values()][0].role="manager";
  const denied=await handleRequest(request("/api/admin/orders/"+transferId,"PATCH",{payment_status:"paid"},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(denied.status,403);
});


test("direct bank checkout persists the selected method and blocks fulfilment until owner verifies payment", async () => {
  const db=new FakeD1();
  const setup=await bootstrap(db);
  const cookie=setup.headers.get("set-cookie").split(";")[0];
  const customerCookie=await customerSession(db,"direct-pay-buyer@example.com");
  db.storeSettings.set("payment_methods",{setting_value_json:JSON.stringify({methods:[
    {id:"cod",kind:"cod",label:"Cash on delivery",enabled:true},
    {id:"bank-transfer",kind:"bank",label:"Bank transfer",enabled:true}
  ]})});
  const productResponse=await handleRequest(request("/api/admin/products","POST",{name:"Payment Test Hoodie",category:"hoodies",audience:"unisex",retail_price_paisa:600001},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  const productId=(await productResponse.json()).id;
  await handleRequest(request("/api/admin/products/"+productId,"PATCH",{status:"published"},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  const variantResponse=await handleRequest(request("/api/admin/products/"+productId+"/variants","POST",{sku:"DV-PAY-M",size:"M",color:"Navy",initial_stock:3},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  const variantId=(await variantResponse.json()).variant.id;
  const placed=await handleRequest(request("/api/orders","POST",{checkout_token:"123e4567-e89b-42d3-a456-426614174099",customer_name:"Direct Pay Buyer",phone:"+923001234567",delivery_address:"House 10, Street 2, Model Town",city:"Jhelum",payment_method:"bank-transfer",items:[{variant_id:variantId,quantity:1}]},{cookie:customerCookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(placed.status,201);
  const order=[...db.orders.values()][0];
  assert.equal(order.payment_method,"bank-transfer");
  assert.equal(order.payment_status,"pending");
  assert.equal(order.delivery_fee_status,"pending_quote");
  const confirmed=await handleRequest(request("/api/admin/orders/"+order.id,"PATCH",{order_status:"confirmed"},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(confirmed.status,200);
  const blocked=await handleRequest(request("/api/admin/orders/"+order.id,"PATCH",{order_status:"processing"},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(blocked.status,409);
  const verified=await handleRequest(request("/api/admin/orders/"+order.id,"PATCH",{payment_status:"paid",payment_reference:"BANK-REF-ORDER-1",financial_account_id:"bank-clearing"},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(verified.status,200);
  const quote=await handleRequest(request("/api/admin/orders/"+order.id+"/delivery-fee","POST",{delivery_fee_paisa:0},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(quote.status,200);
  const quoteBody=await quote.json();
  const approvalToken=new URL(quoteBody.approval_url).searchParams.get("token");
  assert.ok(approvalToken);
  const accepted=await handleRequest(request("/api/delivery-fee/"+approvalToken,"POST",{decision:"accept"}),env(db));
  assert.equal(accepted.status,200);
  const processing=await handleRequest(request("/api/admin/orders/"+order.id,"PATCH",{order_status:"processing"},{cookie,"sec-fetch-site":"same-origin"}),env(db));
  assert.equal(processing.status,200);
});


test("authorised rental staff can preview and download private CNIC images with audit records", async () => {
  const db = new FakeD1();
  const adminId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const rentalId = crypto.randomUUID();
  const token = "rental-document-access-session-token";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Buffer.from(digest).toString("base64url");
  db.admins.set(adminId, { id: adminId, email: "rental@deverve.example", role: "rental", is_active: 1 });
  db.sessions.set(sessionId, { id: sessionId, admin_user_id: adminId, token_hash: tokenHash, expires_at: new Date(Date.now()+3600000).toISOString(), revoked_at: null });
  db.rentalDocuments.set("doc-front", { id: "doc-front", rental_request_id: rentalId, document_side: "cnic_front", object_key: "rental-private/test/front.png", mime_type: "image/png" });
  const bytes = new Uint8Array([137,80,78,71,13,10,26,10]);
  const testEnv = { ...env(db), MEDIA: { get: async () => ({ body: new Response(bytes).body }) } };
  const headers = { cookie: "__Host-deverve_admin="+token, "sec-fetch-site": "same-origin" };
  const preview = await handleRequest(request("/api/admin/rentals/"+rentalId+"/documents/cnic_front", "GET", undefined, headers), testEnv);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-disposition"), 'inline; filename="cnic_front.png"');
  assert.match(preview.headers.get("cache-control") || "", /private, no-store/);
  assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), bytes);
  assert.equal(db.audits.length, 1);
  assert.ok(db.audits[0].includes("rental.document_viewed"));

  const download = await handleRequest(request("/api/admin/rentals/"+rentalId+"/documents/cnic_front?download=1", "GET", undefined, headers), testEnv);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-disposition"), 'attachment; filename="cnic_front.png"');
  assert.equal(db.audits.length, 2);
  assert.ok(db.audits[1].includes("rental.document_downloaded"));

  db.admins.get(adminId).role = "owner";
  const ownerPreview = await handleRequest(request("/api/admin/rentals/"+rentalId+"/documents/cnic_front", "GET", undefined, headers), testEnv);
  assert.equal(ownerPreview.status, 200);
  db.admins.get(adminId).role = "manager";
  const managerPreview = await handleRequest(request("/api/admin/rentals/"+rentalId+"/documents/cnic_front", "GET", undefined, headers), testEnv);
  assert.equal(managerPreview.status, 200);
  assert.equal(db.audits.length, 4);
  const deletion=await handleRequest(request("/api/admin/rentals/"+rentalId+"/documents/cnic_front","DELETE",undefined,headers),testEnv);
  assert.equal(deletion.status,409);
  assert.equal(db.rentalDocuments.has("doc-front"),true);
});

test("CNIC documents remain unavailable to unauthorised staff roles", async () => {
  const db = new FakeD1();
  const adminId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const rentalId = crypto.randomUUID();
  const token = "viewer-document-access-session-token";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Buffer.from(digest).toString("base64url");
  db.admins.set(adminId, { id: adminId, email: "viewer@deverve.example", role: "viewer", is_active: 1 });
  db.sessions.set(sessionId, { id: sessionId, admin_user_id: adminId, token_hash: tokenHash, expires_at: new Date(Date.now()+3600000).toISOString(), revoked_at: null });
  const denied = await handleRequest(request("/api/admin/rentals/"+rentalId+"/documents/cnic_front", "GET", undefined, { cookie: "__Host-deverve_admin="+token }), env(db));
  assert.equal(denied.status, 403);
});

test("Gemini chat rejects a UI greeting as the first model turn and rejects non-alternating history", async () => {
  const db = new FakeD1();
  const firstModel = await handleRequest(request("/api/ai/chat", "POST", {
    messages: [{ role: "model", text: "Welcome" }, { role: "user", text: "Hello" }],
  }), env(db));
  assert.equal(firstModel.status, 400);
  assert.match((await firstModel.json()).error, /start with a customer message/i);
  const repeatedUser = await handleRequest(request("/api/ai/chat", "POST", {
    messages: [{ role: "user", text: "Hello" }, { role: "user", text: "Again" }],
  }), env(db));
  assert.equal(repeatedUser.status, 400);
  assert.match((await repeatedUser.json()).error, /alternate/i);
});

test("Cloudflare imports legacy AIza and modern AQ Gemini keys idempotently in primary/fallback order", async () => {
  const db = new FakeD1();
  const configured = { ...env(db), NabeelG_Api_key1: "AIza" + "A".repeat(32), NabeelG_Api_key2: "AQ." + "B".repeat(48) };
  const first = await importConfiguredGeminiEnvKeys(configured);
  assert.deepEqual(first.map(item => item.status), ["imported", "imported"]);
  assert.equal(db.aiKeys.size, 2);
  const saved = [...db.aiKeys.values()].sort((a, b) => a.priority - b.priority);
  assert.equal(saved[0].label, "NabeelG_Api_key1");
  assert.equal(saved[0].priority, 0);
  assert.equal(saved[0].enabled, 1);
  assert.equal(saved[1].label, "NabeelG_Api_key2");
  assert.equal(saved[1].priority, 1);
  const second = await importConfiguredGeminiEnvKeys(configured);
  assert.deepEqual(second.map(item => item.status), ["already_imported", "already_imported"]);
  assert.equal(db.aiKeys.size, 2);
});

test("Gemini 3.8 generateContent uses the API-key header and omits unsupported temperature", async () => {
  const originalFetch=globalThis.fetch;
  let requestUrl="",requestHeaders={},requestBody=null;
  globalThis.fetch=async(input,init={})=>{
    requestUrl=String(input);requestHeaders=init.headers||{};requestBody=JSON.parse(String(init.body||"{}"));
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"Hello from Gemini"}]}}]}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const key="AQ."+"A".repeat(48);
    const result=await callGemini(key,[{role:"user",parts:[{text:"Hello"}]}],"Test system");
    assert.equal(result.ok,true);
    assert.match(requestUrl,/models\/gemini-3\.8-flash:generateContent$/);
    assert.equal(new URL(requestUrl).search,"");
    assert.equal(requestHeaders["x-goog-api-key"],key);
    assert.deepEqual(requestBody?.generationConfig,{maxOutputTokens:650});
  }finally{globalThis.fetch=originalFetch;}
});

test("Gemini skips an unavailable stable model and reports the model that actually answered", async () => {
  const originalFetch=globalThis.fetch;
  const attempted=[];
  globalThis.fetch=async(input)=>{
    const model=new URL(String(input)).pathname.match(/models\/([^:]+):generateContent$/)?.[1]||"";
    attempted.push(model);
    if(model==="gemini-3.8-flash")return new Response(JSON.stringify({error:{status:"NOT_FOUND",message:"Model not found"}}),{status:404,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"Fallback model answered"}]}}]}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const result=await callGemini("AQ."+"A".repeat(48),[{role:"user",parts:[{text:"Hello"}]}],"Test system");
    assert.equal(result.ok,true);
    assert.equal(result.model,"gemini-3.5-flash-lite");
    assert.deepEqual(attempted,["gemini-3.8-flash","gemini-3.5-flash-lite"]);
  }finally{globalThis.fetch=originalFetch;}
});

test("Gemini retries transient 503 responses on the next supported model", async () => {
  const originalFetch=globalThis.fetch;
  const attempted=[];
  globalThis.fetch=async(input)=>{
    const model=new URL(String(input)).pathname.match(/models\/([^:]+):generateContent$/)?.[1]||"";
    attempted.push(model);
    if(model==="gemini-3.8-flash")return new Response(JSON.stringify({error:{status:"UNAVAILABLE",message:"Temporary service unavailable"}}),{status:503,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"Fallback model answered"}]}}]}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const result=await callGemini("AQ."+"A".repeat(48),[{role:"user",parts:[{text:"Hello"}]}],"Test system");
    assert.equal(result.ok,true);
    assert.equal(result.model,"gemini-3.5-flash-lite");
    assert.deepEqual(attempted,["gemini-3.8-flash","gemini-3.5-flash-lite"]);
  }finally{globalThis.fetch=originalFetch;}
});

test("Gemini model fallback order keeps 3.8 primary, prefers tested free-tier Flash Lite models, and excludes retired 2.5 models", async () => {
  const originalFetch=globalThis.fetch;
  const attempted=[];
  globalThis.fetch=async(input)=>{
    const model=new URL(String(input)).pathname.split("/models/")[1]?.split(":")[0]||"";
    attempted.push(model);
    if(model==="gemini-3.8-flash"||model==="gemini-3.5-flash-lite")return new Response(JSON.stringify({error:{status:"UNAVAILABLE",message:"Temporary service unavailable"}}),{status:503,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"Lite fallback answered"}]}}]}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const result=await callGemini("AQ."+ "A".repeat(48),[{role:"user",parts:[{text:"Hello"}]}],"Test system");
    assert.equal(result.ok,true);
    assert.equal(result.model,"gemini-3.1-flash-lite");
    assert.deepEqual(attempted,["gemini-3.8-flash","gemini-3.5-flash-lite","gemini-3.1-flash-lite"]);
    assert.equal(attempted.some(model=>model.startsWith("gemini-2.5-")),false);
  }finally{globalThis.fetch=originalFetch;}
});

test("authenticated product label scanning sends an image to Gemini and returns structured fields", async () => {
  const db=new FakeD1();
  const key="AQ."+"G".repeat(48);
  const configured={...env(db),NabeelG_Api_key1:key};
  const bootstrapped=await bootstrap(db);
  const cookie=bootstrapped.headers.get("set-cookie").split(";")[0];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
    if(String(input).includes("generativelanguage.googleapis.com")){
      const payload=JSON.parse(init.body);
      assert.ok(payload.contents[0].parts.some(part=>part.inline_data?.mime_type==="image/jpeg"));
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({name:"Denim Jacket",category:"Jackets",audience:"unisex",barcode:"12345678",sku:"SKU-123",retail_price:3500,purchase_cost:1800,size:"M",color:"Indigo",quantity:5})}]}}]}),{status:200,headers:{"content-type":"application/json"}});
    }
    return originalFetch(input,init);
  };
  try{
    const response=await handleRequest(request("/api/admin/products/scan-label","POST",{image_data_url:"data:image/jpeg;base64,aGVsbG8=",barcode:"12345678",sku:"SKU-123"},{cookie,"sec-fetch-site":"same-origin","cf-connecting-ip":"203.0.113.15"}),configured);
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.product.name,"Denim Jacket");
    assert.equal(result.product.barcode,"12345678");
    assert.equal(result.product.sku,"SKU-123");
    assert.equal(result.product.purchase_cost,1800);
  }finally{globalThis.fetch=originalFetch;}
});

test("authenticated product research uses Gemini Google Search grounding and returns cited sources", async () => {
  const db = new FakeD1();
  const key = "AQ." + "R".repeat(48);
  const configured = { ...env(db), NabeelG_Api_key1: key };
  const bootstrapped = await bootstrap(db);
  const cookie = bootstrapped.headers.get("set-cookie").split(";")[0];
  const originalFetch = globalThis.fetch;
  let receivedKey = "";
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) === "https://generativelanguage.googleapis.com/v1beta/interactions") {
      receivedKey = init.headers?.["x-goog-api-key"] || "";
      const body = JSON.parse(String(init.body || "{}"));
      assert.equal(body.model, "gemini-3.8-flash");
      assert.deepEqual(body.tools, [{ type: "google_search" }]);
      assert.match(body.input, /12345678/);
      return new Response(JSON.stringify({
        output_text: "The exact product match is not confirmed. The official page shows a denim jacket.",
        steps: [
          { type: "google_search_call", arguments: { queries: ["12345678 denim jacket official"] } },
          { type: "model_output", content: [{ type: "text", text: "The exact product match is not confirmed.", annotations: [{ type: "url_citation", title: "Official product page", uri: "https://example.com/product" }] }] }
        ]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await handleRequest(request("/api/admin/products/research", "POST", { name: "Denim jacket", barcode: "12345678" }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.22" }), configured);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.model, "gemini-3.8-flash");
    assert.match(result.summary, /exact product match is not confirmed/i);
    assert.deepEqual(result.queries, ["12345678 denim jacket official"]);
    assert.deepEqual(result.sources, [{ title: "Official product page", url: "https://example.com/product" }]);
    assert.equal(receivedKey, key);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("admin AI Command Centre analyses attached images through the server-side Gemini key", async () => {
  const db = new FakeD1();
  const key = "AQ." + "M".repeat(48);
  const configured = { ...env(db), NabeelG_Api_key1: key };
  const bootstrapped = await bootstrap(db);
  const cookie = bootstrapped.headers.get("set-cookie").split(";")[0];
  const originalFetch = globalThis.fetch;
  let sawImage = false;
  globalThis.fetch = async (input, init = {}) => {
    if (String(input).includes("generativelanguage.googleapis.com")) {
      assert.equal(init.headers?.["x-goog-api-key"], key);
      const body = JSON.parse(String(init.body || "{}"));
      const parts = body.contents?.[0]?.parts ?? [];
      sawImage = parts.some(part => part.inline_data?.mime_type === "image/png" && part.inline_data?.data === "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=");
      assert.ok(sawImage, "the validated attached image must reach Gemini as inline image data");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "I can see a clothing product." }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await handleRequest(request("/api/admin/ai/assistant", "POST", {
      task: "chat", messages: [{ role: "user", text: "Describe this product photo." }],
      images: [{ mime_type: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=" }]
    }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.71" }), configured);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reply, "I can see a clothing product.");
    assert.equal(sawImage, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("admin AI Command Centre rejects unauthenticated and unsafe image requests", async () => {
  const db = new FakeD1();
  const unauthenticated = await handleRequest(request("/api/admin/ai/assistant", "POST", {
    task: "chat", messages: [{ role: "user", text: "Hello" }]
  }), env(db));
  assert.equal(unauthenticated.status, 401);
  const bootstrapped = await bootstrap(db);
  const cookie = bootstrapped.headers.get("set-cookie").split(";")[0];
  const malformed = await handleRequest(request("/api/admin/ai/assistant", "POST", {
    task: "chat", messages: [{ role: "user", text: "Analyse this file" }],
    images: [{ mime_type: "image/svg+xml", data: "PHN2Zz4=" }]
  }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.72" }), env(db));
  assert.equal(malformed.status, 400);
});

test("Gemini key management is owner-authenticated and public AI chat fails closed without a key", async () => {
  const db = new FakeD1();
  const vault = await handleRequest(request("/api/admin/ai/keys", "GET"), env(db));
  assert.equal(vault.status, 401);
  const chat = await handleRequest(request("/api/ai/chat", "POST", { messages: [{ role: "user", text: "Hello" }] }), env(db));
  assert.equal(chat.status, 503);
  assert.match((await chat.json()).error, /No usable Gemini key is configured/i);
});

test("public AI chat still uses a configured server secret when the encrypted D1 vault is unavailable", async () => {
  const db=new FakeD1();db.failAiKeyRead=true;
  const key="AQ."+"D".repeat(48),originalFetch=globalThis.fetch;
  let received="";
  globalThis.fetch=async(input,init={})=>{if(String(input).includes("generativelanguage.googleapis.com")){received=init.headers?.["x-goog-api-key"]||"";return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"D1 fallback works"}]}}]}),{status:200,headers:{"content-type":"application/json"}});}return originalFetch(input,init);};
  try{const response=await handleRequest(request("/api/ai/chat","POST",{messages:[{role:"user",text:"Hello"}]}),{...env(db),NabeelG_Api_key1:key});assert.equal(response.status,200);assert.equal((await response.json()).reply,"D1 fallback works");assert.equal(received,key);}finally{globalThis.fetch=originalFetch;}
});

test("public AI chat uses a configured AQ secret directly when the encrypted key vault is unavailable", async () => {
  const db = new FakeD1();
  const key = "AQ." + "C".repeat(48);
  const originalFetch = globalThis.fetch;
  let receivedKey = "";
  globalThis.fetch = async (input, init = {}) => {
    if (String(input).includes("generativelanguage.googleapis.com")) {
      receivedKey = init.headers?.["x-goog-api-key"] || "";
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello from the live assistant" }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  try {
    const chat = await handleRequest(request("/api/ai/chat", "POST", { messages: [{ role: "user", text: "Hello" }] }), { ...env(db, ""), NabeelG_Api_key1: key });
    assert.equal(chat.status, 200);
    const payload = await chat.json();
    assert.equal(payload.reply, "Hello from the live assistant");
    assert.equal(payload.model, "gemini-3.8-flash");
    assert.equal(receivedKey, key);
    assert.equal(db.aiKeys.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("owner notification email validation accepts ordinary business addresses and rejects malformed values", () => {
  assert.equal(isValidEmailAddress("deverve61@gmail.com"), true);
  assert.equal(isValidEmailAddress("accounts@deverve.example"), true);
  assert.equal(isValidEmailAddress("not-an-email"), false);
  assert.equal(isValidEmailAddress("missing-domain@"), false);
  assert.equal(isValidEmailAddress("bad address@example.com"), false);
});


test("public AI chat respects a saved key cooldown instead of bypassing provider rate limits", async () => {
  const db = new FakeD1();
  const key = "AQ." + "E".repeat(48);
  const configured = { ...env(db), NabeelG_Api_key1: key };
  await importConfiguredGeminiEnvKeys(configured);
  const saved = [...db.aiKeys.values()][0];
  assert.ok(saved);
  saved.cooldown_until = new Date(Date.now() + 10 * 60_000).toISOString();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    if (String(input).includes("generativelanguage.googleapis.com")) {
      providerCalls++;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Unexpected provider call" }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await handleRequest(request("/api/ai/chat", "POST", { messages: [{ role: "user", text: "Hello" }] }), configured);
    assert.equal(response.status, 503);
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a successful environment Gemini key test clears the matching vault cooldown", async () => {
  const db = new FakeD1();
  const key = "AQ." + "F".repeat(48);
  const configured = { ...env(db), NabeelG_Api_key1: key };
  await importConfiguredGeminiEnvKeys(configured);
  const saved = [...db.aiKeys.values()][0];
  assert.ok(saved);
  saved.cooldown_until = new Date(Date.now() + 10 * 60_000).toISOString();
  saved.failure_count = 3;
  saved.last_error = "quota_or_rate_limit";
  const bootstrapped = await bootstrap(db);
  const cookie = bootstrapped.headers.get("set-cookie").split(";")[0];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input);
  };
  try {
    const response = await handleRequest(request("/api/admin/ai/keys/test-environment", "POST", {}, { cookie, "sec-fetch-site": "same-origin" }), configured);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(saved.cooldown_until, null);
    assert.equal(saved.failure_count, 0);
    assert.equal(saved.last_error, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("legacy hard-coded recipient is blocked until the owner sets a business inbox", () => {
  assert.equal(isSafeNotificationRecipient("deverve61@gmail.com"), false);
  assert.equal(isSafeNotificationRecipient("accounts@deverve.example"), true);
  assert.equal(isSafeNotificationRecipient("not-an-email"), false);
});

test("AI owner exact-SKU stock command records a balanced inventory adjustment and audit", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  db.products.set("product-stock-1", { id:"product-stock-1", name:"Test Hoodie", status:"published" });
  db.variants.set("variant-stock-1", { id:"variant-stock-1", product_id:"product-stock-1", sku:"DV-TEST-M-BLK", size:"M", color:"Black", stock_on_hand:5, reserved_quantity:2, is_active:1 });
  const response = await handleRequest(request("/api/admin/ai/execute","POST",{command:"set stock for SKU DV-TEST-M-BLK to 8"},{cookie,"sec-fetch-site":"same-origin","cf-connecting-ip":"203.0.113.77"}),env(db));
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.previous_stock,5);
  assert.equal(payload.stock_on_hand,8);
  assert.equal(payload.quantity_delta,3);
  assert.equal(db.variants.get("variant-stock-1").stock_on_hand,8);
  assert.equal(db.movements.length,1);
  assert.equal(db.movements[0].movement_type,"adjustment");
  assert.equal(db.movements[0].quantity_delta,3);
  assert.equal(db.movements[0].reference_type,"count");
  assert.equal(db.audits.length,1);
  assert.equal(db.audits[0][2],"ai.inventory.stock_adjusted");

  const rejected=await handleRequest(request("/api/admin/ai/execute","POST",{command:"set stock for SKU DV-TEST-M-BLK to 1"},{cookie,"sec-fetch-site":"same-origin","cf-connecting-ip":"203.0.113.78"}),env(db));
  assert.equal(rejected.status,409);
  assert.equal(db.variants.get("variant-stock-1").stock_on_hand,8);
  assert.equal(db.movements.length,1);
});

test("AI owner command updates enquiry status and writes an audit record", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  db.enquiries.set(id, { id, status: "new", customer_name: "Test visitor" });
  const response = await handleRequest(request("/api/admin/ai/execute", "POST", { command: "set enquiry " + id + " status to contacted" }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.90" }), env(db));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.action, "update_enquiry_status");
  assert.equal(payload.previous_status, "new");
  assert.equal(payload.status, "contacted");
  assert.equal(db.enquiries.get(id).status, "contacted");
  assert.equal(db.audits.at(-1).action, "ai.enquiry.status_updated");
});

test("AI owner natural-language intent planner interprets conversational requests before execution", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  db.enquiries.set(id, { id, status: "new", customer_name: "Natural language buyer" });
  const configured = env(db);
  configured.NabeelG_Api_key1 = "AIza" + "A".repeat(35);
  const originalFetch = globalThis.fetch;
  let plannerCalled = false;
  globalThis.fetch = async (input, init = {}) => {
    if (String(input).includes("generativelanguage.googleapis.com")) {
      plannerCalled = true;
      const body = JSON.parse(String(init.body || "{}"));
      assert.match(body.contents?.[0]?.parts?.[0]?.text || "", /Please mark this customer enquiry as contacted/i);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ command: "set enquiry " + id + " status to contacted", reason: "The owner clearly requested this status change." }) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await handleRequest(request("/api/admin/ai/execute", "POST", { command: "Please mark this customer enquiry as contacted. We have called and confirmed the details." }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.96" }), configured);
    assert.equal(response.status, 200);
    assert.equal(plannerCalled, true);
    assert.equal(db.enquiries.get(id).status, "contacted");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI owner assistant answers ordinary questions in one Gemini request without a second chat call", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const configured = env(db);
  configured.NabeelG_Api_key1 = "AIza" + "B".repeat(35);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init = {}) => {
    if (String(input).includes("generativelanguage.googleapis.com")) {
      calls++;
      const body = JSON.parse(String(init.body || "{}"));
      assert.match(body.contents?.at(-1)?.parts?.[0]?.text || "", /How many products are live/i);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ command: null, reply: "There are 4 products in the current catalogue." }) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await handleRequest(request("/api/admin/ai/execute", "POST", { command: "How many products are live?" }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.97" }), configured);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.action, null);
    assert.equal(payload.message, "There are 4 products in the current catalogue.");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI owner command prepares a requested wholesale quote without sending or accepting it", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  db.wholesaleQuotes.set(id, { id, status: "requested", valid_until: null, approval_token: "opaque-token" });
  const response = await handleRequest(request("/api/admin/ai/execute", "POST", { command: "set wholesale quote " + id + " status to prepared" }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.91" }), env(db));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.action, "prepare_wholesale_quote");
  assert.equal(payload.status, "prepared");
  assert.match(payload.message, /has not been sent to the customer/i);
  assert.equal(db.wholesaleQuotes.get(id).status, "prepared");
  assert.equal(db.audits.at(-1).action, "ai.wholesale_quote.prepared");
});

test("AI owner order status command reuses the guarded order workflow and audit trail", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  db.orders.set(id, { id, order_number: "DV-TEST-ORDER", order_status: "pending", payment_provider: "manual", payment_status: "pending", delivery_fee_status: "accepted" });
  db.orderItems.push({ id: "order-line-1", order_id: id, variant_id: "variant-order-1", quantity: 1 });
  const response = await handleRequest(request("/api/admin/ai/execute", "POST", { command: "set order " + id + " status to confirmed" }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.94" }), env(db));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.action, "update_order_status");
  assert.equal(payload.status, "confirmed");
  assert.equal(db.orders.get(id).order_status, "confirmed");
  assert.equal(db.orderStatusEvents.at(-1).to_status, "confirmed");
  // The order status event is the durable transition record; this fake D1 batch does not model SQLite changes() for the companion audit INSERT.

  const invalid = await handleRequest(request("/api/admin/ai/execute", "POST", { command: "set order " + id + " status to delivered" }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.95" }), env(db));
  assert.equal(invalid.status, 409);
  assert.equal(db.orders.get(id).order_status, "confirmed");
});

test("AI owner vehicle status action protects active rentals and records the change", async () => {
  const db = new FakeD1();
  const setup = await bootstrap(db);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  db.vehicles.set(id, { id, name: "Test vehicle", status: "available" });
  const changed = await handleRequest(request("/api/admin/ai/execute", "POST", { command: "set vehicle " + id + " status to maintenance" }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.92" }), env(db));
  assert.equal(changed.status, 200);
  assert.equal(db.vehicles.get(id).status, "maintenance");
  assert.equal(db.audits.at(-1).action, "ai.vehicle.status_updated");
  db.rentalRequests.set("rental-active-1", { id: "rental-active-1", vehicle_id: id, status: "confirmed" });
  const blocked = await handleRequest(request("/api/admin/ai/execute", "POST", { command: "set vehicle " + id + " status to available" }, { cookie, "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.93" }), env(db));
  assert.equal(blocked.status, 409);
  assert.equal(db.vehicles.get(id).status, "maintenance");
});

test("bulk media upload recovers an R2 object left behind by an interrupted D1 completion", async () => {
  const db=new FakeD1();
  const setup=await bootstrap(db);
  const cookie=setup.headers.get("set-cookie").split(";")[0];
  const id="22345678-1234-5123-a123-123456789abc";
  const bytes=new Uint8Array([137,80,78,71,1,2,3,4]);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  const sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,"0")).join("");
  const adminId=[...db.admins.keys()][0];
  db.mediaAssets.set(id,{id,object_key:"catalogue/"+id+".png",media_type:"image",mime_type:"image/png",byte_size:bytes.length,alt_text:"Interrupted",caption:"",status:"processing",uploaded_by:adminId,updated_at:new Date().toISOString()});
  db.mediaObjects.set("catalogue/"+id+".png",{body:bytes.buffer,customMetadata:{assetId:id,sha256},httpMetadata:{contentType:"image/png"}});
  const form=new FormData();
  form.append("files",new File([bytes],"recovered.png",{type:"image/png"}),"recovered.png");
  form.append("asset_ids",JSON.stringify([id]));
  const response=await handleRequest(new Request(origin+"/api/admin/media/bulk",{method:"POST",headers:{origin,cookie,"sec-fetch-site":"same-origin"},body:form}),env(db));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.uploaded,1);
  assert.equal(body.media[0].reused,true);
  assert.equal(db.mediaAssets.get(id).status,"ready");
  assert.equal(db.mediaObjects.size,1);
  assert.equal(db.audits.filter(row=>row.action==="media.bulk_uploaded").length,1);
});

test("bulk media uploads resume idempotently and reject reused identifiers with different bytes", async () => {
  const db=new FakeD1();
  const setup=await bootstrap(db);
  const cookie=setup.headers.get("set-cookie").split(";")[0];
  const id="12345678-1234-5123-a123-123456789abc";
  const makeRequest=async bytes=>{
    const form=new FormData();
    form.append("files",new File([new Uint8Array(bytes)],"front.png",{type:"image/png"}),"front.png");
    form.append("asset_ids",JSON.stringify([id]));
    form.append("alt_text","Test hoodie");
    return handleRequest(new Request(origin+"/api/admin/media/bulk",{method:"POST",headers:{origin,cookie,"sec-fetch-site":"same-origin"},body:form}),env(db));
  };
  const first=await makeRequest([137,80,78,71,1,2,3,4]);
  assert.equal(first.status,200);
  const firstBody=await first.json();
  assert.equal(firstBody.uploaded,1);
  assert.equal(firstBody.media[0].reused,false);
  assert.equal(db.mediaAssets.size,1);
  assert.equal(db.mediaObjects.size,1);

  const retry=await makeRequest([137,80,78,71,1,2,3,4]);
  assert.equal(retry.status,200);
  const retryBody=await retry.json();
  assert.equal(retryBody.uploaded,1);
  assert.equal(retryBody.media[0].reused,true);
  assert.equal(db.mediaAssets.size,1);
  assert.equal(db.audits.filter(row=>row.action==="media.bulk_uploaded").length,1);

  const collision=await makeRequest([137,80,78,71,9,8,7,6]);
  assert.equal(collision.status,207);
  const collisionBody=await collision.json();
  assert.equal(collisionBody.uploaded,0);
  assert.equal(collisionBody.failed,1);
  assert.equal(db.mediaAssets.size,1);
});

test("server promotion selection never grants an unconfigured offer", () => {
  const none={code:"",label:"",discountPercent:0,discountAmountPaisa:0,freeDelivery:false};
  assert.deepEqual(selectOrderPromotion(500_000,false),none);
  assert.deepEqual(selectOrderPromotion(500_001,false),none);
  assert.deepEqual(selectOrderPromotion(2_000_001,false),none);
  assert.deepEqual(selectOrderPromotion(4_000_001,true),none);
});


test("public website translation is same-origin, language allowlisted and uses the bounded Workers AI model", async () => {
  const db = new FakeD1();
  const calls = [];
  const testEnv = { ...env(db), TRANSLATION: { fetch: async request => {
    const input = await request.json();
    calls.push({ url: request.url, input });
    return Response.json({ translatedText: "یہ ایک ترجمہ ہے" });
  } } };
  const response = await handleRequest(new Request(origin + "/api/translate", {
    method: "POST",
    headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "cf-connecting-ip": "203.0.113.70" },
    body: JSON.stringify({ text: "Welcome to De VERVE", target_lang: "ur" })
  }), testEnv);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).translatedText, "یہ ایک ترجمہ ہے");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://deverve-translation.internal/translate");
  assert.deepEqual(calls[0].input, { text: "Welcome to De VERVE", target_lang: "ur" });
});

test("public website translation rejects unsupported languages, oversized input and cross-origin requests", async () => {
  const db = new FakeD1();
  let calls = 0;
  const testEnv = { ...env(db), TRANSLATION: { fetch: async () => { calls += 1; return Response.json({ translatedText: "translated" }); } } };
  const send = (body, headers = {}) => handleRequest(new Request(origin + "/api/translate", {
    method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "cf-connecting-ip": "203.0.113.71", ...headers },
    body: JSON.stringify(body)
  }), testEnv);
  assert.equal((await send({ text: "Hello", target_lang: "xx" })).status, 400);
  assert.equal((await send({ text: "x".repeat(601), target_lang: "ur" })).status, 400);
  const crossOrigin = await handleRequest(new Request(origin + "/api/translate", {
    method: "POST", headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site", "content-type": "application/json", "cf-connecting-ip": "203.0.113.72" },
    body: JSON.stringify({ text: "Hello", target_lang: "ur" })
  }), testEnv);
  assert.equal(crossOrigin.status, 403);
  assert.equal(calls, 0);
});

test("public website translation enforces an atomic account-wide daily inference ceiling", async () => {
  const db = new FakeD1();
  let calls = 0;
  const testEnv = { ...env(db), TRANSLATION: { fetch: async () => { calls += 1; return Response.json({ translatedText: "translated" }); } } };
  for (let index = 0; index < 20; index += 1) {
    const response = await handleRequest(new Request(origin + "/api/translate", {
      method: "POST",
      headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "cf-connecting-ip": "198.51.100." + (index + 1) },
      body: JSON.stringify({ text: "A short public page label", target_lang: "ur" })
    }), testEnv);
    assert.equal(response.status, 200);
  }
  const blocked = await handleRequest(new Request(origin + "/api/translate", {
    method: "POST",
    headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "cf-connecting-ip": "198.51.100.99" },
    body: JSON.stringify({ text: "A short public page label", target_lang: "ur" })
  }), testEnv);
  assert.equal(blocked.status, 429);
  assert.equal(calls, 20);
});
