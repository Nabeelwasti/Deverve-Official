import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("voucher issuance is owner/manager-only, hashes codes and supports revocation",()=>{
 const worker=read("worker/index.ts");
 assert.match(worker,/async function adminCouponRoutes/);
 assert.match(worker,/\["owner","manager"\]\.includes\(admin\.role\)/);
 assert.match(worker,/await sha256\(code\)/);
 assert.match(worker,/coupon\.revoked/);
 assert.match(worker,/Only a completed exchange belonging to that customer/);
 assert.match(worker,/documentedColourMismatch=exchange\.reason==="other"&&\/colou\?r\|shade\|variant\/i\.test\(exchange\.details\)/);
 assert.match(read("src/CouponWorkspace.tsx"),/Wrong item \/ colour mismatch compensation/);
});

test("checkout resolves a server-side voucher and records redemption in the order batch",()=>{
 const worker=read("worker/index.ts");
 assert.match(worker,/async function resolveEligibleCoupon/);
 assert.match(worker,/resolveEligibleCoupon\(env\.DB, couponCode, signedInCustomer\.customer_id, subtotal\)/);
 assert.match(worker,/INSERT INTO discount_coupon_redemptions/);
 assert.match(read("migrations/0037_discount_coupons.sql"),/coupon_not_eligible/);
});

test("customer checkout exposes an optional server-validated voucher field",()=>{
 const app=read("src/App.tsx");
 assert.match(app,/\/api\/coupons\/validate/);
 assert.match(app,/checkoutForm\.coupon_code/);
 assert.match(app,/Voucher applied\. The server will verify it again/);
 assert.match(app,/writeAppDraft\("checkout", \{ \.\.\.next, coupon_code: "" \}\)/);
});

test("admin voucher workspace requires a completed case for exchange compensation",()=>{
 const ui=read("src/CouponWorkspace.tsx");
 assert.match(ui,/isExchangePurpose/);
 assert.match(ui,/Completed exchange case<select required/);
 assert.match(ui,/Copy code/);
 assert.match(ui,/Deactivate/);
});

test("restored storefront guidance publishes only owner-approved customer feedback",()=>{
 const worker=read("worker/index.ts");
 const productPage=read("src/ProductPage.tsx");
 const route=worker.slice(worker.indexOf("async function productReviewRoutes"),worker.indexOf("type GeminiKeyRow"));
 assert.match(route,/r\.status='approved'/);
 assert.doesNotMatch(route,/status IN \('approved','pending'\)/);
 assert.match(route,/VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,'pending'\)/);
 assert.match(route,/status:"pending"/);
 assert.match(route,/async function productReviewRoutes/);
 assert.match(productPage,/Approved comments from the De VERVE community/);
 assert.match(productPage,/Your feedback will appear after our team reviews it/);
 assert.match(productPage,/verified_purchase/);
 assert.doesNotMatch(productPage,/published immediately/);
});
