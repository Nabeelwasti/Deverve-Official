import assert from "node:assert/strict";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!accountId || !apiToken) {
  throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (D1 read/write scope) to run isolated remote D1 tests.");
}

const apiBase = "https://api.cloudflare.com/client/v4";
const headers = { authorization: "Bearer " + apiToken, "content-type": "application/json" };
async function api(method, path, body) {
  const response = await fetch(apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const details = (payload.errors ?? []).map((item) => item.message).join("; ");
    throw new Error("Cloudflare D1 API " + method + " " + path + " failed (" + response.status + "): " + details);
  }
  return payload.result;
}
const name = "deverve-inventory-test-" + Date.now().toString(36);
let databaseId;
let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; console.log("PASS", message); };
const sql = (database, statement) => api("POST", "/accounts/" + accountId + "/d1/database/" + database + "/query", statement);
const batch = (database, statements) => sql(database, { batch: statements });
const query = (database, statement, params = []) => sql(database, { sql: statement, params: params.map(String) });
const changes = (result, index = 0) => Number(result?.[index]?.meta?.changes ?? 0);

try {
  const created = await api("POST", "/accounts/" + accountId + "/d1/database", { name, primary_location_hint: "apac" });
  databaseId = created.uuid;
  console.log("Created isolated D1 test database:", name, databaseId);

  await query(databaseId, "CREATE TABLE batch_rollback_probe (id TEXT PRIMARY KEY, unique_code TEXT UNIQUE)");
  let constraintFailed = false;
  try {
    await batch(databaseId, [
      { sql: "INSERT INTO batch_rollback_probe(id,unique_code) VALUES ('rollback-a','duplicate')" },
      { sql: "INSERT INTO batch_rollback_probe(id,unique_code) VALUES ('rollback-b','duplicate')" },
    ]);
  } catch { constraintFailed = true; }
  check(constraintFailed, "D1 rejects a batch containing a unique-constraint violation");
  const rollbackRows = await query(databaseId, "SELECT COUNT(*) AS rows FROM batch_rollback_probe");
  check(rollbackRows[0].results[0].rows === 0, "D1 batch constraint failure rolls back earlier statements");

  await batch(databaseId, [
    { sql: "CREATE TABLE products (id TEXT PRIMARY KEY, status TEXT NOT NULL)" },
    { sql: "CREATE TABLE product_variants (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, stock_on_hand INTEGER NOT NULL, reserved_quantity INTEGER NOT NULL, updated_at TEXT)" },
    { sql: "CREATE TABLE orders (id TEXT PRIMARY KEY, order_status TEXT NOT NULL, payment_provider TEXT NOT NULL, payment_status TEXT NOT NULL, payment_method TEXT NOT NULL, delivery_fee_status TEXT NOT NULL, total_paisa INTEGER NOT NULL DEFAULT 0, financial_transaction_id TEXT, updated_at TEXT)" },
    { sql: "CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, variant_id TEXT, quantity INTEGER NOT NULL)" },
    { sql: "CREATE TABLE payment_attempts (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, amount_paisa INTEGER NOT NULL)" },
    { sql: "CREATE TABLE inventory_movements (id TEXT PRIMARY KEY, variant_id TEXT NOT NULL, movement_type TEXT NOT NULL, quantity_delta INTEGER NOT NULL, reference_type TEXT NOT NULL, reference_id TEXT NOT NULL)" },
    { sql: "CREATE TABLE financial_transactions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, direction TEXT NOT NULL, amount_paisa INTEGER NOT NULL, category TEXT NOT NULL, reference_type TEXT NOT NULL, reference_id TEXT NOT NULL, note TEXT)" },
    { sql: "CREATE TABLE order_inventory_reservations (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, variant_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), status TEXT NOT NULL CHECK(status IN ('reserved','released','consumed')), payment_provider TEXT NOT NULL, payment_reference TEXT, reserved_at TEXT NOT NULL, released_at TEXT, consumed_at TEXT, updated_at TEXT NOT NULL, UNIQUE(order_id,variant_id))" },
    { sql: "CREATE TABLE pos_sales (id TEXT PRIMARY KEY, receipt_number TEXT NOT NULL, total_paisa INTEGER NOT NULL, status TEXT NOT NULL, idempotency_key TEXT NOT NULL)" },
    { sql: "CREATE TABLE pos_sale_items (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, variant_id TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price_paisa INTEGER NOT NULL)" },
    { sql: "CREATE TABLE pos_payments (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, account_id TEXT NOT NULL, amount_paisa INTEGER NOT NULL)" },
    { sql: "CREATE TABLE pos_receipt_outbox (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued')" },
    { sql: "CREATE TABLE audit_logs (id TEXT PRIMARY KEY, action TEXT NOT NULL, entity_id TEXT NOT NULL)" },
  ]);

  await query(databaseId, "INSERT INTO products(id,status) VALUES ('p1','published'); INSERT INTO product_variants(id,product_id,is_active,stock_on_hand,reserved_quantity,updated_at) VALUES ('v-race','p1',1,5,0,'test');");

  const checkout = (id) => batch(databaseId, [
    { sql: "INSERT INTO orders(id,order_status,payment_provider,payment_status,payment_method,delivery_fee_status,updated_at) SELECT ?,'pending','manual','pending','cod','accepted','test' WHERE EXISTS (SELECT 1 FROM product_variants WHERE id='v-race' AND is_active=1 AND stock_on_hand-reserved_quantity>=4)", params: [id] },
    { sql: "UPDATE product_variants SET reserved_quantity=reserved_quantity+4 WHERE id='v-race' AND is_active=1 AND stock_on_hand-reserved_quantity>=4 AND EXISTS (SELECT 1 FROM orders WHERE id=?)", params: [id] },
    { sql: "INSERT INTO order_items(id,order_id,variant_id,quantity) SELECT ?,?,'v-race',4 WHERE EXISTS (SELECT 1 FROM orders WHERE id=?)", params: ["item-" + id, id, id] },
    { sql: "INSERT INTO order_inventory_reservations(id,order_id,variant_id,quantity,status,payment_provider,reserved_at,updated_at) SELECT ?,?,'v-race',4,'reserved','manual','test','test' WHERE EXISTS (SELECT 1 FROM orders WHERE id=?)", params: ["reservation-" + id, id, id] },
  ]);
  const racing = await Promise.all([checkout("checkout-a"), checkout("checkout-b")]);
  check(racing.filter(result => changes(result, 0) === 1).length === 1, "concurrent checkout allows exactly one order insert against 5 available units");
  const raceState = await query(databaseId, "SELECT (SELECT COUNT(*) FROM orders) AS orders,(SELECT reserved_quantity FROM product_variants WHERE id='v-race') AS reserved,(SELECT COALESCE(SUM(quantity),0) FROM order_items) AS items,(SELECT COUNT(*) FROM order_inventory_reservations WHERE status='reserved') AS reservation_rows,(SELECT COALESCE(SUM(quantity),0) FROM order_inventory_reservations WHERE status='reserved') AS reservation_quantity");
  check(raceState[0].results[0].orders === 1 && raceState[0].results[0].reserved === 4 && raceState[0].results[0].items === 4 && raceState[0].results[0].reservation_rows === 1 && raceState[0].results[0].reservation_quantity === 4, "concurrent checkout leaves one durable reservation row matching the order item and stock counter");

  await query(databaseId, "DELETE FROM order_inventory_reservations; DELETE FROM order_items; DELETE FROM orders; UPDATE product_variants SET stock_on_hand=5,reserved_quantity=0 WHERE id='v-race';");
  const competingCheckout = checkout("cross-channel-checkout");
  const posSale = (id) => batch(databaseId, [
    { sql: "INSERT INTO pos_sales(id,receipt_number,total_paisa,status,idempotency_key) SELECT ?,?,?, 'completed',? WHERE EXISTS (SELECT 1 FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id='v-race' AND v.is_active=1 AND p.status='published' AND v.stock_on_hand-v.reserved_quantity>=2)", params: [id, "R-" + id, 2000, "idem-" + id] },
    { sql: "INSERT INTO pos_sale_items(id,sale_id,variant_id,quantity,unit_price_paisa) SELECT ?,?,'v-race',1,1000 WHERE EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: ["pos-line-a-" + id, id, id] },
    { sql: "INSERT INTO pos_sale_items(id,sale_id,variant_id,quantity,unit_price_paisa) SELECT ?,?,'v-race',1,1000 WHERE EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: ["pos-line-b-" + id, id, id] },
    { sql: "UPDATE product_variants SET stock_on_hand=stock_on_hand-1 WHERE id='v-race' AND is_active=1 AND stock_on_hand-reserved_quantity>=1 AND EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: [id] },
    { sql: "INSERT INTO inventory_movements(id,variant_id,movement_type,quantity_delta,reference_type,reference_id) SELECT ?, 'v-race','sold',-1,'pos_sale',? WHERE changes()=1 AND EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: ["pos-move-a-" + id, id, id] },
    { sql: "UPDATE product_variants SET stock_on_hand=stock_on_hand-1 WHERE id='v-race' AND is_active=1 AND stock_on_hand-reserved_quantity>=1 AND EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: [id] },
    { sql: "INSERT INTO inventory_movements(id,variant_id,movement_type,quantity_delta,reference_type,reference_id) SELECT ?, 'v-race','sold',-1,'pos_sale',? WHERE changes()=1 AND EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: ["pos-move-b-" + id, id, id] },
    { sql: "INSERT INTO pos_payments(id,sale_id,account_id,amount_paisa) SELECT ?,?,'cash-main',2000 WHERE EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: ["pos-payment-" + id, id, id] },
    { sql: "INSERT INTO financial_transactions(id,account_id,direction,amount_paisa,category,reference_type,reference_id,note) SELECT ?, 'cash-main','in',2000,'pos_sale','pos_sale',?,'POS race test' WHERE EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: ["pos-ledger-" + id, id, id] },
    { sql: "INSERT INTO audit_logs(id,action,entity_id) SELECT ?, 'pos.sale_completed',? WHERE EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: ["pos-audit-" + id, id, id] },
    { sql: "INSERT INTO pos_receipt_outbox(id,sale_id,channel) SELECT ?,?,'email' WHERE EXISTS (SELECT 1 FROM pos_sales WHERE id=?)", params: ["pos-outbox-" + id, id, id] },
  ]);
  const crossRace = await Promise.all([competingCheckout, posSale("cross-channel-pos")]);
  const checkoutWon = changes(crossRace[0], 0) === 1;
  const posWon = changes(crossRace[1], 0) === 1;
  check(Number(checkoutWon) + Number(posWon) === 1, "online checkout and POS sale contend on the same D1 stock balance without overselling");
  const crossState = await query(databaseId, "SELECT (SELECT COUNT(*) FROM orders) AS orders,(SELECT COUNT(*) FROM pos_sales) AS pos_sales,(SELECT stock_on_hand FROM product_variants WHERE id='v-race') AS stock,(SELECT reserved_quantity FROM product_variants WHERE id='v-race') AS reserved,(SELECT COUNT(*) FROM order_inventory_reservations WHERE status='reserved') AS reservation_rows,(SELECT COALESCE(SUM(quantity),0) FROM order_inventory_reservations WHERE status='reserved') AS reservation_quantity,(SELECT COUNT(*) FROM pos_sale_items) AS pos_lines,(SELECT COUNT(*) FROM pos_payments) AS pos_payments,(SELECT COUNT(*) FROM financial_transactions WHERE reference_type='pos_sale') AS pos_ledger,(SELECT COUNT(*) FROM inventory_movements WHERE reference_type='pos_sale') AS pos_movements,(SELECT COUNT(*) FROM audit_logs WHERE action='pos.sale_completed') AS pos_audits,(SELECT COUNT(*) FROM pos_receipt_outbox) AS pos_outbox");
  const cross = crossState[0].results[0];
  if (posWon) {
    check(cross.orders === 0 && cross.pos_sales === 1 && cross.stock === 3 && cross.reserved === 0 && cross.reservation_rows === 0 && cross.reservation_quantity === 0 && cross.pos_lines === 2 && cross.pos_payments === 1 && cross.pos_ledger === 1 && cross.pos_movements === 2 && cross.pos_audits === 1 && cross.pos_outbox === 1, "successful duplicate-line POS sale commits its complete inventory, payment, ledger, audit and receipt records");
  } else {
    check(cross.orders === 1 && cross.pos_sales === 0 && cross.stock === 5 && cross.reserved === 4 && cross.reservation_rows === 1 && cross.reservation_quantity === 4 && cross.pos_lines === 0 && cross.pos_payments === 0 && cross.pos_ledger === 0 && cross.pos_movements === 0 && cross.pos_audits === 0 && cross.pos_outbox === 0, "when online checkout wins, the blocked POS attempt leaves no orphan financial or receipt records");
  }

  await query(databaseId, "DELETE FROM order_inventory_reservations; DELETE FROM order_items; DELETE FROM orders; DELETE FROM product_variants; INSERT INTO product_variants(id,product_id,is_active,stock_on_hand,reserved_quantity,updated_at) VALUES ('v-dispatch','p1',1,10,5,'test'),('v-short','p1',1,4,4,'test'),('v-cancel','p1',1,8,5,'test'),('v-cancel-short','p1',1,8,4,'test'),('v-paid','p1',1,5,5,'test');");
  await query(databaseId, "INSERT INTO orders(id,order_status,payment_provider,payment_status,payment_method,delivery_fee_status,total_paisa,updated_at) VALUES ('o-dispatch','processing','manual','pending','cod','accepted',1000,'test'),('o-short','processing','manual','pending','cod','accepted',1000,'test'),('o-cancel','pending','manual','pending','bank_transfer','accepted',1000,'test'),('o-cancel-short','pending','manual','pending','bank_transfer','accepted',1000,'test'),('o-paid','pending','safepay','pending','online','accepted',12500,'test');");
  await query(databaseId, "INSERT INTO order_items(id,order_id,variant_id,quantity) VALUES ('d1','o-dispatch','v-dispatch',2),('d2','o-dispatch','v-dispatch',3),('s1','o-short','v-short',3),('s2','o-short','v-short',2),('c1','o-cancel','v-cancel',2),('c2','o-cancel','v-cancel',3),('cs1','o-cancel-short','v-cancel-short',3),('cs2','o-cancel-short','v-cancel-short',2),('p1','o-paid','v-paid',2),('p2','o-paid','v-paid',3);");
  await query(databaseId, "INSERT INTO order_inventory_reservations(id,order_id,variant_id,quantity,status,payment_provider,reserved_at,updated_at) VALUES ('r-dispatch','o-dispatch','v-dispatch',5,'reserved','manual','test','test'),('r-short','o-short','v-short',5,'reserved','manual','test','test'),('r-cancel','o-cancel','v-cancel',5,'reserved','manual','test','test'),('r-cancel-short','o-cancel-short','v-cancel-short',5,'reserved','manual','test','test'),('r-paid','o-paid','v-paid',5,'reserved','safepay','test','test');");

  const stockGuard = "NOT EXISTS (SELECT 1 FROM (SELECT variant_id,SUM(quantity) AS required_quantity FROM order_items WHERE order_id=orders.id AND variant_id IS NOT NULL GROUP BY variant_id) oi LEFT JOIN product_variants v ON v.id=oi.variant_id WHERE v.id IS NULL OR v.stock_on_hand<oi.required_quantity OR v.reserved_quantity<oi.required_quantity)";
  const reserveGuard = "NOT EXISTS (SELECT 1 FROM (SELECT variant_id,SUM(quantity) AS required_quantity FROM order_items WHERE order_id=orders.id AND variant_id IS NOT NULL GROUP BY variant_id) oi LEFT JOIN product_variants v ON v.id=oi.variant_id WHERE v.id IS NULL OR v.reserved_quantity<oi.required_quantity)";
  const dispatched = await batch(databaseId, [
    { sql: "UPDATE orders SET order_status='dispatched' WHERE id='o-dispatch' AND order_status='processing' AND delivery_fee_status='accepted' AND " + stockGuard },
    { sql: "UPDATE product_variants SET stock_on_hand=stock_on_hand-5,reserved_quantity=reserved_quantity-5 WHERE id='v-dispatch' AND stock_on_hand>=5 AND reserved_quantity>=5 AND EXISTS (SELECT 1 FROM orders WHERE id='o-dispatch' AND order_status='dispatched')" },
    { sql: "INSERT INTO inventory_movements(id,variant_id,movement_type,quantity_delta,reference_type,reference_id) SELECT 'm-dispatch','v-dispatch','sold',-5,'order','o-dispatch' WHERE changes()=1 AND EXISTS (SELECT 1 FROM orders WHERE id='o-dispatch' AND order_status='dispatched')" },
    { sql: "UPDATE order_inventory_reservations SET status='consumed',consumed_at='test',updated_at='test' WHERE order_id='o-dispatch' AND variant_id='v-dispatch' AND status='reserved' AND changes()=1" },
  ]);
  check(changes(dispatched, 0) === 1 && changes(dispatched, 1) === 1 && changes(dispatched, 2) === 1 && changes(dispatched, 3) === 1, "duplicate dispatch lines are aggregated and decrement stock/reservations once and consume the reservation ledger");

  const blockedDispatch = await batch(databaseId, [
    { sql: "UPDATE orders SET order_status='dispatched' WHERE id='o-short' AND order_status='processing' AND delivery_fee_status='accepted' AND " + stockGuard },
    { sql: "UPDATE product_variants SET stock_on_hand=stock_on_hand-5,reserved_quantity=reserved_quantity-5 WHERE id='v-short' AND stock_on_hand>=5 AND reserved_quantity>=5 AND EXISTS (SELECT 1 FROM orders WHERE id='o-short' AND order_status='dispatched')" },
    { sql: "INSERT INTO inventory_movements(id,variant_id,movement_type,quantity_delta,reference_type,reference_id) SELECT 'm-short','v-short','sold',-5,'order','o-short' WHERE changes()=1 AND EXISTS (SELECT 1 FROM orders WHERE id='o-short' AND order_status='dispatched')" },
  ]);
  check(changes(blockedDispatch, 0) === 0 && changes(blockedDispatch, 1) === 0 && changes(blockedDispatch, 2) === 0, "insufficient combined stock blocks dispatch without changing stock or writing a movement");

  const cancelled = await batch(databaseId, [
    { sql: "UPDATE orders SET order_status='cancelled' WHERE id='o-cancel' AND order_status='pending' AND payment_status!='paid' AND " + reserveGuard },
    { sql: "UPDATE product_variants SET reserved_quantity=reserved_quantity-5 WHERE id='v-cancel' AND reserved_quantity>=5 AND EXISTS (SELECT 1 FROM orders WHERE id='o-cancel' AND order_status='cancelled')" },
    { sql: "UPDATE order_inventory_reservations SET status='released',released_at='test',updated_at='test' WHERE order_id='o-cancel' AND variant_id='v-cancel' AND status='reserved' AND changes()=1" },
  ]);
  check(changes(cancelled, 0) === 1 && changes(cancelled, 1) === 1 && changes(cancelled, 2) === 1, "duplicate cancellation lines release their combined reservation and ledger exactly once");

  const blockedCancel = await batch(databaseId, [
    { sql: "UPDATE orders SET order_status='cancelled' WHERE id='o-cancel-short' AND order_status='pending' AND payment_status!='paid' AND " + reserveGuard },
    { sql: "UPDATE product_variants SET reserved_quantity=reserved_quantity-5 WHERE id='v-cancel-short' AND reserved_quantity>=5 AND EXISTS (SELECT 1 FROM orders WHERE id='o-cancel-short' AND order_status='cancelled')" },
  ]);
  check(changes(blockedCancel, 0) === 0 && changes(blockedCancel, 1) === 0, "insufficient combined reservation blocks cancellation and preserves reserved stock");

  await query(databaseId, "INSERT INTO payment_attempts(id,order_id,provider,status,amount_paisa) VALUES ('pa-paid','o-paid','safepay','pending',12500);");
  const paid = await batch(databaseId, [
    { sql: "UPDATE payment_attempts SET status='succeeded' WHERE id='pa-paid' AND status IN ('created','pending') AND EXISTS (SELECT 1 FROM orders WHERE id=payment_attempts.order_id AND payment_provider='safepay' AND (payment_status!='paid' OR financial_transaction_id IS NULL) AND total_paisa=payment_attempts.amount_paisa AND delivery_fee_status='accepted' AND order_status IN ('pending','confirmed'))" },
    { sql: "UPDATE orders SET payment_status='paid',financial_transaction_id='ft-paid' WHERE id='o-paid' AND payment_provider='safepay' AND (payment_status!='paid' OR financial_transaction_id IS NULL) AND total_paisa=12500 AND delivery_fee_status='accepted' AND order_status IN ('pending','confirmed') AND EXISTS (SELECT 1 FROM payment_attempts WHERE id='pa-paid' AND order_id=orders.id AND status='succeeded' AND amount_paisa=orders.total_paisa)" },
    { sql: "INSERT INTO financial_transactions(id,account_id,direction,amount_paisa,category,reference_type,reference_id,note) SELECT 'ft-paid','gateway-clearing','in',12500,'website_order','order','o-paid','Safepay' WHERE EXISTS (SELECT 1 FROM orders WHERE id='o-paid' AND payment_status='paid' AND financial_transaction_id='ft-paid') AND EXISTS (SELECT 1 FROM payment_attempts WHERE id='pa-paid' AND status='succeeded')" },
  ]);
  check(changes(paid, 0) === 1 && changes(paid, 1) === 1 && changes(paid, 2) === 1, "Safepay success advances matching attempt, order and gateway ledger together");

  const fulfilPaid = await batch(databaseId, [
    { sql: "UPDATE orders SET order_status='dispatched' WHERE id='o-paid' AND order_status='pending' AND payment_status='paid' AND delivery_fee_status='accepted' AND " + stockGuard },
    { sql: "UPDATE product_variants SET stock_on_hand=stock_on_hand-5,reserved_quantity=reserved_quantity-5 WHERE id='v-paid' AND stock_on_hand>=5 AND reserved_quantity>=5 AND EXISTS (SELECT 1 FROM orders WHERE id='o-paid' AND order_status='dispatched')" },
    { sql: "INSERT INTO inventory_movements(id,variant_id,movement_type,quantity_delta,reference_type,reference_id) SELECT 'm-paid','v-paid','sold',-5,'order','o-paid' WHERE changes()=1 AND EXISTS (SELECT 1 FROM orders WHERE id='o-paid' AND order_status='dispatched')" },
    { sql: "UPDATE order_inventory_reservations SET status='consumed',consumed_at='test',updated_at='test' WHERE order_id='o-paid' AND variant_id='v-paid' AND status='reserved' AND changes()=1" },
  ]);
  check(fulfilPaid.every((item, index) => changes(fulfilPaid, index) === 1), "paid order can dispatch duplicate variant lines exactly once and consume its reservation without changing its payment ledger");
  const finalState = await query(databaseId, "SELECT o.order_status,o.payment_status,o.financial_transaction_id,v.stock_on_hand,v.reserved_quantity,(SELECT COUNT(*) FROM financial_transactions WHERE reference_id='o-paid') AS ledger_count,(SELECT COALESCE(SUM(quantity_delta),0) FROM inventory_movements WHERE reference_id='o-paid') AS movement_total,(SELECT status FROM order_inventory_reservations WHERE order_id='o-paid' AND variant_id='v-paid') AS reservation_status FROM orders o JOIN product_variants v ON v.id='v-paid' WHERE o.id='o-paid'");
  const final = finalState[0].results[0];
  check(final.order_status === "dispatched" && final.payment_status === "paid" && final.financial_transaction_id === "ft-paid" && final.stock_on_hand === 0 && final.reserved_quantity === 0 && final.ledger_count === 1 && final.movement_total === -5 && final.reservation_status === "consumed", "paid order, one financial ledger row, exact inventory movement and consumed reservation reconcile end-to-end");

  console.log("Remote D1 integration checks passed:", passed);
} finally {
  if (databaseId) {
    await api("DELETE", "/accounts/" + accountId + "/d1/database/" + databaseId);
    console.log("Deleted isolated D1 test database:", databaseId);
  }
}
