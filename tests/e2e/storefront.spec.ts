import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: 'window.turnstile = { render: function (element, options) { var badge = document.createElement("div"); badge.textContent = "Test security verification"; badge.setAttribute("data-testid", "turnstile-test-widget"); element.appendChild(badge); window.setTimeout(function () { options.callback("e2e-turnstile-token"); }, 0); return "e2e-widget"; }, reset: function () {}, remove: function () {} };',
    });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/products" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [] }) });
      return;
    }
    if (url.pathname === "/api/vehicles" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ vehicles: [] }) });
      return;
    }
    if (url.pathname === "/api/rentals/settings" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cnic_uploads_enabled: true }) });
      return;
    }
    if (url.pathname === "/api/storefront/settings" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ social_links: {}, brand_assets: {} }) });
      return;
    }
    await route.continue();
  });
});

test("storefront renders and accepts a customer enquiry", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/enquiries", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ accepted: true }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Elevate");
  await expect(page.getByRole("button", { name: "Toggle navigation" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Contact", exact: true }).click();
  await page.getByLabel("Your name").fill("Browser Test Customer");
  await page.getByLabel("Phone / WhatsApp").fill("+923001234567");
  await page.getByLabel("How can we help?").fill("Please share information about available garments.");
  await page.getByRole("button", { name: /Send enquiry/ }).click();

  await expect(page.getByRole("status")).toContainText("Your enquiry has been received");
  expect(submitted).toMatchObject({
    name: "Browser Test Customer",
    phone: "+923001234567",
    website: "",
    turnstile_token: "e2e-turnstile-token",
  });
});

test("rental request requires both CNIC images and sends them with the request", async ({ page }) => {
  let submitted: string | undefined;
  await page.route("**/api/rentals", async (route) => {
    submitted = route.request().postData() ?? "";
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        accepted: true,
        reference_code: "DV-R-TEST-123456789012",
        rental_days: 1,
        estimated_daily_rate_paisa: 1200000,
        estimated_total_paisa: 1200000,
        message: "Test request received with both documents.",
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Car rental", exact: true }).click();
  await page.getByRole("button", { name: "Request a rental" }).click();
  const dialog = page.getByRole("dialog", { name: "Request a rental." });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("turnstile-test-widget")).toBeVisible();
  await dialog.getByLabel(/Your name/).fill("Browser Test Customer");
  await dialog.getByLabel(/Phone \/ WhatsApp/).fill("+923001234567");
  await dialog.getByLabel(/Pickup complete address/).fill("10 Test Street, Jhelum");
  await dialog.getByLabel(/Destination complete address/).fill("20 Test Road, Lahore");

  const submitButton = dialog.getByRole("button", { name: /Submit rental request/ });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await expect(dialog.getByLabel(/CNIC front image/)).toHaveJSProperty("validity.valid", false);
  expect(submitted).toBeUndefined();

  const png = {
    name: "cnic.png",
    mimeType: "image/png",
    buffer: Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]),
  };
  await dialog.getByLabel(/CNIC front image/).setInputFiles(png);
  await dialog.getByLabel(/CNIC back image/).setInputFiles({ ...png, name: "cnic-back.png" });
  await dialog.getByLabel(/I confirm these are my documents/).check();
  await submitButton.click();

  await expect(dialog.getByText("DV-R-TEST-123456789012")).toBeVisible();
  expect(submitted).toContain("cnic_front");
  expect(submitted).toContain("cnic_back");
  expect(submitted).toContain("cnic_consent");
  expect(submitted).toContain("e2e-turnstile-token");
});

test("rental form explains blocked Turnstile and keeps the request safely blocked", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", async (route) => route.abort("blockedbyclient"));
  let submitted = false;
  await page.route("**/api/rentals", async (route) => { submitted = true; await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ accepted: true }) }); });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Car rental", exact: true }).click();
  await page.getByRole("button", { name: "Request a rental" }).click();
  const dialog = page.getByRole("dialog", { name: "Request a rental." });
  await expect(dialog.getByText(/Cloudflare security verification was blocked/i)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Retry security check" })).toBeVisible();
  await dialog.getByLabel(/Your name/).fill("Browser Test Customer");
  await dialog.getByLabel("Phone / WhatsApp").fill("+923001234567");
  await dialog.getByLabel(/Pickup complete address/).fill("10 Test Street, Jhelum");
  await dialog.getByLabel(/Destination complete address/).fill("20 Test Road, Lahore");
  const png = { name: "cnic.png", mimeType: "image/png", buffer: Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]) };
  await dialog.getByLabel(/CNIC front image/).setInputFiles(png);
  await dialog.getByLabel(/CNIC back image/).setInputFiles({ ...png, name: "cnic-back.png" });
  await dialog.getByLabel(/I confirm these are my documents/).check();
  await dialog.getByRole("button", { name: /Submit rental request/ }).click();
  await expect(dialog.getByRole("alert")).toContainText(/Security verification is not complete/i);
  expect(submitted).toBe(false);
});

test("rental estimate recalculates for the selected vehicle and driver option", async ({ page }) => {
  await page.route("**/api/vehicles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ vehicles: [{
        id: "11111111-1111-4111-8111-111111111111", name: "Test Sedan", vehicle_type: "Sedan",
        transmission: "Automatic", seats: 5, fuel_type: "Petrol", daily_rate_paisa: 850000,
        with_driver_daily_rate_paisa: 1200000, image_key: null, image_url: null, description: "",
      }] }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Car rental", exact: true }).click();
  await page.getByRole("button", { name: "Request a rental" }).click();
  const dialog = page.getByRole("dialog", { name: "Request a rental." });
  await expect(dialog.getByLabel(/Vehicle/)).toContainText("Test Sedan");
  await dialog.getByLabel(/Vehicle/).selectOption("11111111-1111-4111-8111-111111111111");
  await expect(dialog.locator(".rental-estimate-total")).toContainText("12,000");
  await dialog.getByLabel(/Driver option/).selectOption("self_drive");
  await expect(dialog.locator(".rental-estimate-total")).toContainText("8,500");
});


test("bilingual customer policies are accessible from the storefront", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Policies", exact: true }).click();
  await expect(page.getByRole("heading", { name: /clear by design/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exchange-only policy & complaints" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "صرف تبدیلی کی پالیسی اور شکایات" })).toBeVisible();
  await expect(page.getByText(/CNIC documents/i)).toBeVisible();
});


test("product page supports auto-advancing galleries, selectable variants and direct cart addition", async ({ page }) => {
  const imageA = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Crect width='320' height='400' fill='%23142b4d'/%3E%3C/svg%3E";
  const imageB = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Crect width='320' height='400' fill='%2370263d'/%3E%3C/svg%3E";
  await page.route("**/api/products*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "navy-hoodie", name: "De VERVE Hoodie",
      description: "Test product", category: "Hoodies", audience: "unisex", retail_price_paisa: 350000,
      image_key: null, seo_title: "De VERVE Hoodie", seo_description: "Test hoodie",
      media: [
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", media_type: "image", alt_text: "Front view", is_primary: 1, url: imageA },
        { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", media_type: "image", alt_text: "Back view", is_primary: 0, url: imageB },
      ],
      variants: [
        { id: "11111111-1111-4111-8111-111111111111", sku: "DV-HOOD-NAV-S", size: "S", color: "Navy", available_quantity: 4 },
        { id: "22222222-2222-4222-8222-222222222222", sku: "DV-HOOD-NAV-L", size: "L", color: "Navy", available_quantity: 3 },
        { id: "33333333-3333-4333-8333-333333333333", sku: "DV-HOOD-BLK-S", size: "S", color: "Black", available_quantity: 2 },
        { id: "44444444-4444-4444-8444-444444444444", sku: "DV-HOOD-BLK-L", size: "L", color: "Black", available_quantity: 5 },
      ],
    }] }) });
  });
  await page.goto("/product/navy-hoodie");
  await expect(page.getByRole("heading", { name: "De VERVE Hoodie" })).toBeVisible();
  await expect(page.locator(".dv-gallery-meta")).toHaveText("1 / 2");
  await page.waitForTimeout(4400);
  await expect(page.locator(".dv-gallery-meta")).toHaveText("2 / 2");
  await page.getByRole("button", { name: "Colour Black" }).click();
  await page.getByRole("button", { name: "Size L" }).click();
  await expect(page.getByText("5 in stock for selected option")).toBeVisible();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  const checkout = page.getByRole("dialog", { name: "Choose how to pay" });
  await expect(checkout).toBeVisible();
  await expect(checkout).toContainText("De VERVE Hoodie");
});
