import { test, expect } from "@playwright/test";

test("signed-in customer is directed to the WhatsApp exchange process for an eligible delivered order", async ({ page }) => {
  const orderId = "11111111-1111-4111-8111-111111111111";
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/customer/me" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, customer: { id: "33333333-3333-4333-8333-333333333333", email: "customer@example.com", full_name: "Browser Customer", phone: "+923001234567", email_verified: false } }) });
      return;
    }
    if (url.pathname === "/api/customer/orders" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders: [{ id: orderId, order_number: "DV-EXCHANGE-E2E", city: "Jhelum", subtotal_paisa: 125000, delivery_fee_paisa: 0, total_paisa: 125000, discount_code: "", discount_label: "", discount_amount_paisa: 0, free_delivery: 0, payment_method: "cod", payment_provider: "manual", payment_status: "pending", order_status: "delivered", delivery_fee_status: "accepted", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), items: [{ id: "22222222-2222-4222-8222-222222222222", product_name_snapshot: "Stretch Hoodie", sku_snapshot: "DV-HOOD-M", size_snapshot: "M", color_snapshot: "Navy", quantity: 1, unit_price_paisa: 125000, line_total_paisa: 125000 }], events: [] }] }) });
      return;
    }
    if (url.pathname === "/api/customer/rentals" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rentals: [] }) });
      return;
    }
    if (url.pathname === "/api/customer/returns" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ returns: [] }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/account");
  await expect(page.getByText("DV-EXCHANGE-E2E")).toBeVisible();
  const exchangeLink = page.getByRole("link", { name: /request an exchange via whatsapp/i });
  await expect(exchangeLink).toBeVisible();
  await expect(exchangeLink).toHaveAttribute("target", "_blank");
  const href = await exchangeLink.getAttribute("href");
  expect(href).toContain("wa.me/923197553705");
  expect(decodeURIComponent(href ?? "")).toContain("DV-EXCHANGE-E2E");
  expect(decodeURIComponent(href ?? "")).toContain("exchange");
});
