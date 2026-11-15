import { test, expect } from "@playwright/test";

test("signed-in customer can submit and view a return request for a delivered order", async ({ page }) => {
  const orderId = "11111111-1111-4111-8111-111111111111";
  const itemId = "22222222-2222-4222-8222-222222222222";
  let returns: Array<Record<string, unknown>> = [];
  let submitted: Record<string, unknown> | undefined;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/customer/me" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, customer: { id: "33333333-3333-4333-8333-333333333333", email: "customer@example.com", full_name: "Browser Customer", phone: "+923001234567", email_verified: false } }) });
      return;
    }
    if (url.pathname === "/api/customer/orders" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders: [{ id: orderId, order_number: "DV-RETURN-E2E", city: "Jhelum", subtotal_paisa: 125000, delivery_fee_paisa: 0, total_paisa: 125000, payment_method: "cod", payment_provider: "manual", payment_status: "pending", order_status: "delivered", delivery_fee_status: "accepted", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), items: [{ id: itemId, product_name_snapshot: "Stretch Hoodie", sku_snapshot: "DV-HOOD-M", size_snapshot: "M", color_snapshot: "Navy", quantity: 1, unit_price_paisa: 125000, line_total_paisa: 125000 }], events: [] }] }) });
      return;
    }
    if (url.pathname === "/api/customer/rentals" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rentals: [] }) });
      return;
    }
    if (url.pathname === "/api/customer/returns" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ returns }) });
      return;
    }
    if (url.pathname === "/api/customer/orders/" + orderId + "/returns" && request.method() === "POST") {
      submitted = request.postDataJSON() as Record<string, unknown>;
      returns = [{ id: "44444444-4444-4444-8444-444444444444", order_id: orderId, return_number: "DV-RET-E2E-001", order_number: "DV-RETURN-E2E", reason: "damaged", details: "A seam is open near the sleeve.", status: "requested", refund_amount_paisa: 125000, refund_method: null, refund_reference: null, admin_note: "", created_at: new Date().toISOString(), items: [{ quantity: 1, unit_refund_paisa: 125000, product_name_snapshot: "Stretch Hoodie", sku_snapshot: "DV-HOOD-M", size_snapshot: "M", color_snapshot: "Navy" }] }];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ accepted: true, return_number: "DV-RET-E2E-001", refund_amount_paisa: 125000 }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/account");
  await expect(page.getByText("DV-RETURN-E2E")).toBeVisible();
  await page.getByRole("button", { name: "Request a return" }).click();
  await page.getByLabel("Reason").selectOption("damaged");
  await page.locator(".customer-return-items input").fill("1");
  await page.getByLabel("Tell us what happened").fill("A seam is open near the sleeve.");
  await page.getByRole("button", { name: "Submit return request" }).click();

  await expect(page.getByRole("status")).toContainText("DV-RET-E2E-001");
  expect(submitted).toMatchObject({
    reason: "damaged",
    details: "A seam is open near the sleeve.",
    items: [{ order_item_id: itemId, quantity: 1 }],
  });

  await page.getByRole("button", { name: "My returns (1)" }).click();
  await expect(page.getByText("DV-RET-E2E-001")).toBeVisible();
  await expect(page.getByText("Estimated item refund")).toBeVisible();
});
