import { test, expect } from "@playwright/test";

test("signed-in customer can submit and track an eligible delivered-order exchange", async ({ page }) => {
  const orderId = "11111111-1111-4111-8111-111111111111";
  const orderItemId = "22222222-2222-4222-8222-222222222222";
  let exchanges: Array<Record<string, unknown>> = [];
  let submitted: Record<string, unknown> | undefined;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/customer/me" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, customer: { id: "33333333-3333-4333-8333-333333333333", email: "customer@example.com", full_name: "Browser Customer", phone: "+923001234567", email_verified: false } }) });
      return;
    }
    if (url.pathname === "/api/customer/orders" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders: [{ id: orderId, order_number: "DV-EXCHANGE-E2E", city: "Jhelum", subtotal_paisa: 125000, delivery_fee_paisa: 0, total_paisa: 125000, discount_code: "", discount_label: "", discount_amount_paisa: 0, free_delivery: 0, payment_method: "cod", payment_provider: "manual", payment_status: "pending", order_status: "delivered", delivery_fee_status: "accepted", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), items: [{ id: orderItemId, product_name_snapshot: "Stretch Hoodie", sku_snapshot: "DV-HOOD-M", size_snapshot: "M", color_snapshot: "Navy", quantity: 1, unit_price_paisa: 125000, line_total_paisa: 125000 }], events: [] }] }) });
      return;
    }
    if (url.pathname === "/api/customer/rentals" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rentals: [] }) });
      return;
    }
    if (url.pathname === "/api/customer/exchanges" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exchanges }) });
      return;
    }
    if (url.pathname === "/api/customer/orders/" + orderId + "/exchanges" && request.method() === "POST") {
      submitted = request.postDataJSON() as Record<string, unknown>;
      exchanges = [{
        id: "44444444-4444-4444-8444-444444444444",
        order_id: orderId,
        exchange_number: "DV-EX-TEST-123",
        order_number: "DV-EXCHANGE-E2E",
        reason: submitted.reason,
        details: submitted.details,
        status: "requested",
        admin_note: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [{ id: "55555555-5555-4555-8555-555555555555", order_item_id: orderItemId, quantity: 1, requested_size: "L", requested_color: "Black", product_name_snapshot: "Stretch Hoodie", sku_snapshot: "DV-HOOD-M", size_snapshot: "M", color_snapshot: "Navy" }],
        events: [{ id: "66666666-6666-4666-8666-666666666666", from_status: null, to_status: "requested", note: "Exchange request submitted", created_at: new Date().toISOString() }],
      }];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ accepted: true, exchange_number: "DV-EX-TEST-123", message: "Your exchange request has been received." }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/account");
  await expect(page.getByText("DV-EXCHANGE-E2E")).toBeVisible();
  await page.getByRole("button", { name: "Request exchange" }).click();
  await page.getByLabel("Reason").selectOption("size_issue");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Requested size").fill("L");
  await page.getByLabel("Requested colour").fill("Black");
  await page.getByLabel("Tell us what happened").fill("The current size is too small; please exchange it for size L.");
  await page.getByRole("button", { name: "Submit exchange request" }).click();

  await expect(page.getByText("DV-EX-TEST-123").first()).toBeVisible();
  await expect(page.getByText(/Exchange request DV-EX-TEST-123 has been submitted/)).toBeVisible();
  expect(submitted).toMatchObject({
    reason: "size_issue",
    details: "The current size is too small; please exchange it for size L.",
    items: [{ order_item_id: orderItemId, quantity: 1, requested_size: "L", requested_color: "Black" }],
  });
});
