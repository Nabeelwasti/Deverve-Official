import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: 'window.turnstile = { render: function (element, options) { var badge = document.createElement("div"); badge.textContent = "Test security verification"; badge.setAttribute("data-testid", "turnstile-test-widget"); element.appendChild(badge); var frame = document.createElement("iframe"); frame.setAttribute("aria-hidden", "true"); frame.style.display = "none"; element.appendChild(frame); window.setTimeout(function () { options.callback("e2e-turnstile-token"); }, 0); return "e2e-widget"; }, reset: function () {}, remove: function () {} };',
    });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/customer/me" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, customer: { id: "33333333-3333-4333-8333-333333333333", email: "customer@example.com", full_name: "Browser Customer", phone: "+923001234567", email_verified: false } }) });
      return;
    }
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
    if (url.pathname === "/api/reviews/featured" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reviews: [{ id: "review-e2e-1", rating: 5, title: "Lovely", body: "A real approved customer review used in this browser test.", verified_purchase: 0, reviewer_name: "Browser Customer", product_name: "Trouser", product_slug: "trouser" }] }) });
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
  });
});

test("AI support uses a compact in-composer control layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".top-quote-strip p")).toHaveText(/.+/);
  await expect(page.locator(".top-quote-strip cite")).toHaveText(/— .+/);
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  const chat = page.getByRole("dialog", { name: "De VERVE AI customer support" });
  await expect(chat.getByText("De VERVE Assistant", { exact: true })).toBeVisible();
  await expect(chat).toBeVisible();
  await expect(chat.getByRole("textbox", { name: "Your message" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Add attachment" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Speak your message" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Send message" })).toBeVisible();
  for (const control of [
    chat.getByRole("button", { name: "Add attachment" }),
    chat.getByRole("button", { name: "Speak your message" }),
    chat.getByRole("button", { name: "Send message" })
  ]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(48);
    expect(bounds!.height).toBeGreaterThanOrEqual(48);
  }
  await expect(chat.locator(".ai-chat-shortcuts")).toHaveCount(0);
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
  await expect(page.locator(".dv-toast")).toContainText(/Please check this box|Please select a file|CNIC/i);
  expect(submitted).toBeUndefined();

  const png = {
    name: "cnic.png",
    mimeType: "image/png",
    buffer: Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]),
  };
  await dialog.getByLabel(/CNIC front image/).setInputFiles(png);
  await dialog.getByLabel(/CNIC back image/).setInputFiles({ ...png, name: "cnic-back.png" });
  await dialog.getByLabel(/I confirm that I am authorised to submit these documents/).check();
  await submitButton.click();

  await expect(dialog.getByText("DV-R-TEST-123456789012")).toBeVisible();
  expect(submitted).toContain("cnic_front");
  expect(submitted).toContain("cnic_back");
  expect(submitted).toContain("cnic_consent");
  expect(submitted).toContain("rental-cnic-2026-11-21-v1");
  expect(submitted).toContain("e2e-turnstile-token");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("deverve:app-draft:v1:rental-result"))).toContain("DV-R-TEST-123456789012");

  await page.reload();
  const restoredSuccess = page.getByRole("dialog", { name: "Request a rental." });
  await expect(restoredSuccess.getByText("DV-R-TEST-123456789012")).toBeVisible();
  await expect(restoredSuccess.getByText("Rental request submitted successfully")).toBeVisible();
});

test("rental settings failures explain the cause and can be retried", async ({ page }) => {
  let available = false;
  await page.route("**/api/rentals/settings", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    if (!available) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Database temporarily unavailable" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cnic_uploads_enabled: true }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Car rental", exact: true }).click();
  await page.getByRole("button", { name: "Request a rental" }).click();
  const dialog = page.getByRole("dialog", { name: "Request a rental." });
  await expect(dialog.getByRole("alert")).toContainText("Database temporarily unavailable");
  await expect(dialog.getByRole("button", { name: "Retry rental security settings" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Submit rental request/ })).toBeDisabled();
  available = true;
  await dialog.getByRole("button", { name: "Retry rental security settings" }).click();
  await expect(dialog.getByRole("button", { name: /Submit rental request/ })).toBeEnabled();
});

test("rental form reports when Turnstile loads but never mounts its challenge", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: 'window.turnstile = { render: function () { return "stalled-widget"; }, reset: function () {}, remove: function () {} };',
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Car rental", exact: true }).click();
  await page.getByRole("button", { name: "Request a rental" }).click();
  const dialog = page.getByRole("dialog", { name: "Request a rental." });
  await expect(dialog.getByText(/challenge did not appear within 12 seconds/i)).toBeVisible({ timeout: 16000 });
  await expect(dialog.getByRole("button", { name: "Retry security check" })).toBeVisible();
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
  await dialog.getByLabel(/I confirm that I am authorised to submit these documents/).check();
  await dialog.getByRole("button", { name: /Submit rental request/ }).click();
  await expect(dialog.getByRole("alert")).toContainText(/Security verification is not complete/i);
  await expect(page.locator(".dv-toast")).toContainText(/Security verification is not complete/i);
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


test.describe("Pakistan rental time handling", () => {
  test.use({ timezoneId: "America/New_York" });

  test("submits rental wall-clock times as Pakistan time, independent of the visitor timezone", async ({ page }) => {
    let submitted = "";
    await page.route("**/api/rentals", async (route) => {
      submitted = route.request().postData() ?? "";
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ accepted: true, reference_code: "DV-R-TZ-TEST-123456789012", rental_days: 1, estimated_daily_rate_paisa: null, estimated_total_paisa: null }),
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await page.getByRole("button", { name: "Car rental", exact: true }).click();
    await page.getByRole("button", { name: "Request a rental" }).click();
    const dialog = page.getByRole("dialog", { name: "Request a rental." });
    await dialog.getByLabel(/Your name/).fill("Timezone Test Customer");
    await dialog.getByLabel(/Phone \/ WhatsApp/).fill("+923001234567");
    await dialog.getByLabel(/Pickup complete address/).fill("10 Test Street, Jhelum");
    await dialog.getByLabel(/Destination complete address/).fill("20 Test Road, Lahore");
    await dialog.getByLabel(/Pickup date & time/).fill("2026-12-10T10:00");
    await dialog.getByLabel(/Return date & time/).fill("2026-12-11T10:00");
    const png = { name: "cnic.png", mimeType: "image/png", buffer: Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]) };
    await dialog.getByLabel(/CNIC front image/).setInputFiles(png);
    await dialog.getByLabel(/CNIC back image/).setInputFiles({ ...png, name: "cnic-back.png" });
    await dialog.getByLabel(/I confirm that I am authorised to submit these documents/).check();
    await dialog.getByRole("button", { name: /Submit rental request/ }).click();
    await expect(dialog.getByText("DV-R-TZ-TEST-123456789012")).toBeVisible();
    expect(submitted).toContain("2026-12-10T10:00");
    expect(submitted).toContain("2026-12-11T10:00");
    expect(submitted).not.toContain("2026-12-10T15:00:00.000Z");
  });
});

test("product gallery switches to the selected colour's own photos", async ({ page }) => {
  const navyImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Crect width='320' height='400' fill='%23142b4d'/%3E%3C/svg%3E";
  const blackImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Crect width='320' height='400' fill='%230b0b0b'/%3E%3C/svg%3E";
  await page.route("**/api/products*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: [{
        id: "88888888-8888-4888-8888-888888888888", slug: "colour-gallery-test", name: "Colour Gallery Hoodie",
        description: "Colour-specific image test", category: "Hoodies", audience: "unisex", retail_price_paisa: 350000,
        image_key: null, seo_title: "Colour Gallery Hoodie", seo_description: "Test colour-specific gallery",
        media: [
          { id: "99999999-9999-4999-8999-999999999999", media_type: "image", alt_text: "Navy front view", caption: "", is_primary: 1, color: "Navy", url: navyImage },
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", media_type: "image", alt_text: "Black front view", caption: "", is_primary: 0, color: "Black", url: blackImage },
        ],
        variants: [
          { id: "11111111-1111-4111-8111-111111111111", sku: "DV-HOOD-NAV-M", size: "M", color: "Navy", available_quantity: 4 },
          { id: "22222222-2222-4222-8222-222222222222", sku: "DV-HOOD-BLK-M", size: "M", color: "Black", available_quantity: 5 },
        ],
      }] }),
    });
  });
  await page.goto("/product/colour-gallery-test");
  const gallery = page.locator(".product-page-gallery");
  await expect(gallery.locator(".dv-gallery-stage img")).toHaveAttribute("alt", "Navy front view");
  await page.getByRole("button", { name: "Colour Black" }).click();
  await expect(gallery.locator(".dv-gallery-stage img")).toHaveAttribute("alt", "Black front view");
});

test("vehicle fleet galleries auto-advance and support manual navigation", async ({ page }) => {
  const imageA = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%23142b4d'/%3E%3C/svg%3E";
  const imageB = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%2370263d'/%3E%3C/svg%3E";
  await page.route("**/api/vehicles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ vehicles: [{
        id: "55555555-5555-4555-8555-555555555555", name: "Gallery Test Sedan", vehicle_type: "Sedan",
        transmission: "Automatic", seats: 5, fuel_type: "Petrol", daily_rate_paisa: 850000,
        with_driver_daily_rate_paisa: 1200000, image_key: null, image_url: null, description: "Gallery test vehicle",
        media: [
          { id: "66666666-6666-4666-8666-666666666666", url: imageA, alt_text: "Front vehicle view", position: 0, is_primary: 1 },
          { id: "77777777-7777-4777-8777-777777777777", url: imageB, alt_text: "Side vehicle view", position: 1, is_primary: 0 },
        ],
      }] }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Car rental", exact: true }).click();
  const gallery = page.locator(".mobility-vehicle-gallery");
  await gallery.scrollIntoViewIfNeeded();
  await expect(gallery.locator(".dv-gallery-meta")).toHaveText("1 / 2");
  await page.mouse.move(0, 0); // Move away so the gallery is not intentionally paused by hover.
  await page.waitForTimeout(4400);
  await expect(gallery.locator(".dv-gallery-meta")).toHaveText("2 / 2");
  await gallery.getByRole("button", { name: "Previous product image" }).click();
  await expect(gallery.locator(".dv-gallery-meta")).toHaveText("1 / 2");
  const stage = gallery.locator(".dv-gallery-stage");
  const bounds = await stage.boundingBox();
  if (!bounds) throw new Error("Vehicle gallery stage is not measurable.");
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(gallery.locator(".dv-gallery-meta")).toHaveText("2 / 2");
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
  await expect(page.getByText("5 in stock for the selected option")).toBeVisible();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.locator(".product-added-message")).toContainText("Added to your cart");
  const cart = JSON.parse(await page.evaluate(() => localStorage.getItem("deverve-cart") || "[]"));
  expect(cart[0]).toMatchObject({ variant_id: "44444444-4444-4444-8444-444444444444", size: "L", color: "Black", quantity: 1 });
});


test("published product detail page supports gallery zoom, size and colour selection, and cart addition", async ({ page }) => {
  const imageA = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Crect width='320' height='400' fill='%23141414'/%3E%3C/svg%3E";
  const imageB = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Crect width='320' height='400' fill='%23555555'/%3E%3C/svg%3E";
  await page.route("**/api/products?slug=trouser", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [{
      id: "88888888-8888-4888-8888-888888888888", slug: "trouser", name: "Trouser", description: "Everyday comfort trousers",
      category: "Trousers", audience: "unisex", retail_price_paisa: 200000, image_key: null, seo_title: "Trouser | De VERVE",
      seo_description: "Everyday comfort trousers", variants: [{ id: "11111111-1111-4111-8111-111111111111", sku: null, size: "S, M, L, XL", color: "Black, Red, Grey, White, Yellow", available_quantity: 2000 }],
      media: [
        { id: "99999999-9999-4999-8999-999999999999", media_type: "image", alt_text: "Trouser rear view", caption: "", is_primary: 1, color: "Black", url: imageA },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", media_type: "image", alt_text: "Trouser worn fit", caption: "", is_primary: 0, color: "Black", url: imageB },
      ],
    }] }) });
  });
  await page.goto("/product/trouser");
  await expect(page.getByRole("heading", { level: 1, name: "Trouser" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Size S" })).toBeVisible();
  await page.getByRole("button", { name: "Open image zoom" }).click();
  await expect(page.getByRole("dialog", { name: "Zoomed product image" })).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("150%")).toBeVisible();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(page.getByText("100%")).toBeVisible();
  await page.getByRole("button", { name: "Close image zoom" }).click();
  await page.getByRole("button", { name: "Size M" }).click();
  await page.getByRole("button", { name: "Colour Grey" }).click();
  await expect(page.locator(".product-specifications")).toContainText("M");
  await expect(page.locator(".product-specifications")).toContainText("Grey");
  await expect(page.locator(".dv-gallery-empty")).toHaveCount(0);
  await expect(page.locator(".product-page-gallery .dv-gallery-stage img")).toHaveAttribute("alt", /representative image; photos for the selected colour are not available yet/i);
  await expect(page.locator(".product-page-gallery .dv-gallery-stage img")).toBeVisible();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.locator(".product-added-message")).toContainText("Added to your cart");
  const cart = JSON.parse(await page.evaluate(() => localStorage.getItem("deverve-cart") || "[]"));
  expect(cart[0]).toMatchObject({ variant_id: "11111111-1111-4111-8111-111111111111", size: "M", color: "Grey", quantity: 1 });
});


test("product variants let shoppers choose colour or size first and hide unavailable combinations", async ({ page }) => {
  await page.route("**/api/products?slug=variant-choice-test", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [{
      id: "88888888-8888-4888-8888-888888888888", slug: "variant-choice-test", name: "Variant Choice Test",
      description: "Variant selection regression fixture", category: "Hoodies", audience: "unisex",
      retail_price_paisa: 250000, image_key: null, seo_title: "Variant Choice Test", seo_description: "Test",
      variants: [
        { id: "11111111-1111-4111-8111-111111111111", sku: "DV-TEST-S-BLK", size: "S", color: "Black", available_quantity: 2 },
        { id: "22222222-2222-4222-8222-222222222222", sku: "DV-TEST-L-RED", size: "L", color: "Red", available_quantity: 3 },
        { id: "33333333-3333-4333-8333-333333333333", sku: "DV-TEST-M-RED", size: "M", color: "Red", available_quantity: 4 },
        { id: "44444444-4444-4444-8444-444444444444", sku: "DV-TEST-XL-BLU", size: "XL", color: "Blue", available_quantity: 0 }
      ],
      media: []
    }] }) });
  });
  await page.goto("/product/variant-choice-test");
  await expect(page.getByRole("heading", { name: "Variant Choice Test" })).toBeVisible();
  await page.getByRole("button", { name: "Colour Red" }).click();
  await expect(page.locator(".product-specifications")).toContainText("L");
  await expect(page.locator(".product-specifications")).toContainText("Red");
  await page.getByRole("button", { name: "Size M" }).click();
  await expect(page.locator(".product-specifications")).toContainText("M");
  await expect(page.locator(".product-specifications")).toContainText("Red");
  await expect(page.getByRole("button", { name: "Size XL" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Colour Blue" })).toBeDisabled();

  // Reload to verify the reverse interaction order independently.
  await page.goto("/product/variant-choice-test");
  await page.getByRole("button", { name: "Size M" }).click();
  await expect(page.locator(".product-specifications")).toContainText("M");
  await expect(page.locator(".product-specifications")).toContainText("Red");
  await page.getByRole("button", { name: "Colour Red" }).click();
  await expect(page.locator(".product-specifications")).toContainText("M");
  await expect(page.locator(".product-specifications")).toContainText("Red");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  const cart = JSON.parse(await page.evaluate(() => localStorage.getItem("deverve-cart") || "[]"));
  expect(cart[0]).toMatchObject({ variant_id: "33333333-3333-4333-8333-333333333333", size: "M", color: "Red", quantity: 1 });
});


test("cart opens as a review step and merges repeated identical lines", async ({ page }) => {
  await page.addInitScript(() => {
    const line = { variant_id: "11111111-1111-4111-8111-111111111111", product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "De VERVE Hoodie", sku: "DV-HOOD-NAV-M", size: "M", color: "Navy", quantity: 1, unit_price_paisa: 350000, available_quantity: 5 };
    localStorage.setItem("deverve-cart", JSON.stringify([line, { ...line, quantity: 2 }]));
  });
  await page.goto("/");
  await expect(page.locator(".header-cart")).toContainText("3");
  await page.locator(".header-cart").click();
  await expect(page.getByRole("dialog", { name: /Your cart/ })).toBeVisible();
  await expect(page.getByText("Choose how to pay")).toHaveCount(0);
  await expect(page.locator(".cart-line-item")).toHaveCount(1);
  await expect(page.locator(".cart-line-item output")).toHaveText("3");
  await page.getByRole("button", { name: /Proceed to checkout/ }).click();
  await expect(page.getByRole("dialog", { name: /Choose how to pay/ })).toBeVisible();
});


test("mobile cart dialog stays above the bottom navigation and keeps checkout reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const line = { variant_id: "11111111-1111-4111-8111-111111111111", product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "De VERVE Hoodie", sku: "DV-HOOD-NAV-M", size: "M", color: "Navy", quantity: 1, unit_price_paisa: 350000, available_quantity: 5 };
    localStorage.setItem("deverve-cart", JSON.stringify([line]));
  });
  await page.goto("/");
  const dock = page.locator(".mobile-dock");
  await expect(dock).toBeVisible();
  await dock.getByRole("button", { name: /Cart/ }).click();
  const dialog = page.getByRole("dialog", { name: /Your cart/ });
  await expect(dialog).toBeVisible();
  const backdrop = page.locator(".cart-backdrop");
  await expect(backdrop).toHaveCSS("z-index", "1400");
  const dockZ = await dock.evaluate(element => Number.parseInt(getComputedStyle(element).zIndex, 10));
  const backdropZ = await backdrop.evaluate(element => Number.parseInt(getComputedStyle(element).zIndex, 10));
  expect(backdropZ).toBeGreaterThan(dockZ);
  // The accessible dialog is the cart panel itself (.checkout-panel.cart-panel).
  const panelBox = await dialog.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0);
  expect(panelBox!.y).toBeGreaterThanOrEqual(0);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(844);
  const checkout = dialog.getByRole("button", { name: /Proceed to checkout/ });
  await expect(checkout).toBeVisible();
  const checkoutBox = await checkout.boundingBox();
  expect(checkoutBox).not.toBeNull();
  expect(checkoutBox!.y + checkoutBox!.height).toBeLessThanOrEqual(844);
  const hitTarget = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return Boolean(element?.closest(".cart-panel"));
  }, { x: checkoutBox!.x + checkoutBox!.width / 2, y: checkoutBox!.y + checkoutBox!.height / 2 });
  expect(hitTarget).toBeTruthy();
  await expect(dialog.getByRole("button", { name: "Close cart" })).toBeVisible();
});

test("install app control remains visible when the browser does not expose a native install prompt", async ({ page }) => {
  await page.goto("/");
  const installButton = page.getByRole("button", { name: "Install De VERVE app" });
  await expect(installButton).toBeVisible();
  await installButton.click();
  await expect(page.getByRole("dialog", { name: "Install De VERVE" })).toBeVisible();
});

test("AI chat sends only real alternating conversation turns to Gemini", async ({ page }) => {
  const submitted: { payload: { messages: Array<{ role: string; text: string }>; attachments?: unknown[] } | null } = { payload: null };
  await page.route("**/api/ai/chat", async (route) => {
    submitted.payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "Test assistant reply" }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  await page.getByRole("textbox", { name: "Your message" }).fill("Hello De VERVE");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Test assistant reply")).toBeVisible();
  expect(submitted.payload?.messages).toEqual([{ role: "user", text: "Hello De VERVE" }]);
  expect(submitted.payload?.attachments).toEqual([]);
});

test("customer AI chat provides camera, gallery, image-file, copy and per-message speaker actions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  const chat = page.getByRole("dialog", { name: "De VERVE AI customer support" });
  await expect(chat.getByRole("button", { name: "Speak your message" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Add attachment" })).toBeVisible();
  await chat.getByRole("button", { name: "Add attachment" }).click();
  await expect(chat.getByRole("menuitem", { name: "Take a photo" })).toBeVisible();
  await expect(chat.getByRole("menuitem", { name: "Choose from gallery" })).toBeVisible();
  await expect(chat.getByRole("menuitem", { name: "Attach any file" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Copy assistant message" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Speak message" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Listen to latest response" })).toHaveCount(0);
  await expect(chat.getByRole("combobox", { name: "Voice recognition language" })).toHaveCount(0);
  await expect(chat.getByText("＋ Photo")).toHaveCount(0);
});


test("customer AI chat attaches and sends a product photo", async ({ page }) => {
  const submitted: { attachments?: Array<{ name: string; mime_type: string; data: string }> } = {};
  await page.route("**/api/ai/chat", async route => {
    Object.assign(submitted, route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "I can inspect the visible garment details." }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  await page.locator(".ai-chat-panel input[type=file]").nth(1).setInputFiles({
    name: "garment-label.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF8sAAAAASUVORK5CYII=", "base64")
  });
  await expect(page.getByAltText("Image attachment 1")).toBeVisible();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("I can inspect the visible garment details.")).toBeVisible();
  expect(submitted.attachments).toHaveLength(1);
  expect(submitted.attachments?.[0].mime_type).toBe("image/png");
  expect(submitted.attachments?.[0].data.startsWith("iVBORw0KGgo")).toBeTruthy();
});

test("product card opens from its content and product cart merges by size and colour", async ({ page }) => {
  const product = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    slug: "trouser",
    status: "published",
    is_featured: true,
    is_active: true,
    name: "Trouser",
    description: "Premium everyday trousers.",
    category: "Trousers",
    audience: "Adults",
    retail_price_paisa: 1200000,
    image_key: "11111111-1111-4111-8111-111111111111",
    seo_title: "Trouser | De VERVE",
    seo_description: "Premium trousers",
    variants: [
      { id: "11111111-1111-4111-8111-111111111111", sku: "TR-M-BLK", size: "M", color: "Black", available_quantity: 5 },
      { id: "22222222-2222-4222-8222-222222222222", sku: "TR-M-NVY", size: "M", color: "Navy", available_quantity: 3 },
    ],
    media: [
      { id: "black-1", media_type: "image", mime_type: "image/jpeg", alt_text: "Black rear view", caption: "", is_primary: 1, color: "Black", url: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" },
      { id: "navy-1", media_type: "image", mime_type: "image/jpeg", alt_text: "Navy front view", caption: "", is_primary: 0, color: "Navy", url: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" },
    ],
  };
  await page.route("**/api/products**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/reviews")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reviews: [], average_rating: null, rating_count: 0 }) });
      return;
    }
    if (url.pathname === "/api/products") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [product] }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  // Use the visible hero entry point so desktop and mobile follow the same screen-first route.
  await page.getByRole("button", { name: /Explore fashion/ }).click();
  await expect(page.locator(".live-catalogue")).toBeVisible();
  await page.locator(".product-card h4").getByText("Trouser").click();
  await expect(page).toHaveURL(/\/product\/trouser$/);
  await expect(page.locator(".product-page-media-column")).toBeVisible();
  await expect(page.locator(".product-color-thumb")).toHaveCount(2);

  const addButton = page.getByRole("button", { name: /Add to cart/ });
  await addButton.click();
  await addButton.click();
  await page.getByRole("button", { name: "Colour Navy" }).click();
  await addButton.click();

  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("deverve-cart") || "[]"));
  expect(cart).toHaveLength(2);
  expect(cart.find((item: { color: string }) => item.color === "Black").quantity).toBe(2);
  expect(cart.find((item: { color: string }) => item.color === "Navy").quantity).toBe(1);

  await page.reload();
  await expect(page).toHaveURL(/\/product\/trouser$/);
  await expect(page.getByRole("heading", { name: "Trouser", exact: true })).toBeVisible();
  await expect(page.locator(".product-page-media-column")).toBeVisible();
});


test("restores the active storefront section and unfinished enquiry after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Contact", exact: true }).click();
  await expect(page.locator(".store-main")).toHaveAttribute("data-screen", "contact");
  await expect(page).toHaveURL(/screen=contact/);

  await page.getByLabel("Your name").fill("Progress Recovery Customer");
  await page.getByLabel("Phone / WhatsApp").fill("+923001234567");
  await page.getByLabel("How can we help?").fill("I am completing an enquiry and must not lose this message.");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("deverve:app-draft:v1:enquiry"))).toContain("Progress Recovery Customer");

  await page.reload();
  await expect(page.locator(".store-main")).toHaveAttribute("data-screen", "contact");
  await expect(page.getByLabel("Your name")).toHaveValue("Progress Recovery Customer");
  await expect(page.getByLabel("Phone / WhatsApp")).toHaveValue("+923001234567");
  await expect(page.getByLabel("How can we help?")).toHaveValue("I am completing an enquiry and must not lose this message.");
});

test("restores an open rental form and its text fields after reload while requiring file re-selection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Car rental", exact: true }).click();
  await page.getByRole("button", { name: "Request a rental" }).click();
  const dialog = page.getByRole("dialog", { name: "Request a rental." });
  await dialog.getByLabel(/Your name/).fill("Rental Progress Customer");
  await dialog.getByLabel(/Phone \/ WhatsApp/).fill("+923001234567");
  await dialog.getByLabel(/Pickup complete address/).fill("10 Test Street, Jhelum");
  await dialog.getByLabel(/Destination complete address/).fill("20 Test Road, Lahore");

  await page.reload();
  const restored = page.getByRole("dialog", { name: "Request a rental." });
  await expect(restored).toBeVisible();
  await expect(restored.getByLabel(/Your name/)).toHaveValue("Rental Progress Customer");
  await expect(restored.getByLabel(/Phone \/ WhatsApp/)).toHaveValue("+923001234567");
  await expect(restored.getByLabel(/Pickup complete address/)).toHaveValue("10 Test Street, Jhelum");
  await expect(restored.getByLabel(/Destination complete address/)).toHaveValue("20 Test Road, Lahore");
  await expect(restored.getByLabel(/CNIC front image/)).toHaveValue("");
  await expect(restored.getByLabel(/CNIC back image/)).toHaveValue("");
});


test("keeps the car-rental section selected after a full page reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Car rental", exact: true }).click();
  await expect(page.locator(".store-main")).toHaveAttribute("data-screen", "mobility");
  await expect(page).toHaveURL(/screen=mobility/);
  await page.reload();
  await expect(page.locator(".store-main")).toHaveAttribute("data-screen", "mobility");
  await expect(page.getByRole("heading", { name: /Make room for/ })).toBeVisible();
});

test("cart shows the image belonging to the selected product colour", async ({ page }) => {
  const genericImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Crect width='320' height='400' fill='%23d8d8d8'/%3E%3C/svg%3E";
  const navyImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Crect width='320' height='400' fill='%23142b4d'/%3E%3C/svg%3E";
  const blackImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='400'%3E%3Crect width='320' height='400' fill='%230b0b0b'/%3E%3C/svg%3E";
  await page.route("**/api/products*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: [{
        id: "88888888-8888-4888-8888-888888888888", slug: "cart-image-test", name: "Cart Image Test Hoodie", status: "published", is_active: 1,
        description: "Colour-specific cart image regression test", category: "Hoodies", audience: "unisex", retail_price_paisa: 350000,
        image_key: null, seo_title: "Cart Image Test Hoodie", seo_description: "Test cart image",
        media: [
          { id: "99999999-9999-4999-8999-999999999999", media_type: "image", mime_type: "image/svg+xml", alt_text: "Generic hoodie", caption: "", is_primary: 1, color: "", url: genericImage },
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", media_type: "image", mime_type: "image/svg+xml", alt_text: "Navy hoodie", caption: "", is_primary: 0, color: "Navy", url: navyImage },
          { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", media_type: "image", mime_type: "image/svg+xml", alt_text: "Black hoodie", caption: "", is_primary: 0, color: "Black", url: blackImage },
        ],
        variants: [
          { id: "11111111-1111-4111-8111-111111111111", sku: "DV-CART-NAV-M", size: "M", color: "Navy", available_quantity: 4 },
          { id: "22222222-2222-4222-8222-222222222222", sku: "DV-CART-BLK-M", size: "M", color: "Black", available_quantity: 5 },
        ],
      }] }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Fashion", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cart Image Test Hoodie" })).toBeVisible();
  await page.getByRole("button", { name: "Colour Black" }).click();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.locator(".header-cart").click();
  const cartImage = page.locator(".cart-line-image img");
  await expect(cartImage).toBeVisible();
  await expect(cartImage).toHaveAttribute("src", blackImage);
});

test("storefront uses verified service wording instead of fabricated social proof or inactive offers", async ({ page }) => {
  await page.goto("/");
  const body = page.locator("body");
  await expect(page.locator(".trust-pillars-section")).toHaveCount(1);
  await expect(page.locator(".trust-pillars-section")).toContainText("Find your fit");
  await expect(page.locator(".trust-pillars-section a[href=\"/?screen=fashion\"]")).toBeVisible();
  await expect(page.locator(".trust-pillars-section a[href=\"/account\"]")).toBeVisible();
  await expect(page.locator(".trust-pillars-section a[href=\"/?screen=wholesale\"]")).toBeVisible();
  await expect(page.locator(".trust-pillars-section a[href=\"/?screen=mobility\"]")).toBeVisible();
  await expect(page.locator(".intro-strip")).toHaveCount(1);
  await expect(page.locator(".intro-strip")).toContainText("One local team.");
  await expect(page.locator(".collections-section")).toHaveCount(1);
  await expect(page.locator(".testimonial-card")).toHaveCount(1);
  await expect(page.locator(".testimonial-card")).toContainText("Browser Customer");
  await expect(page.locator(".testimonial-card")).toContainText("Customer feedback");
  await page.goto("/?screen=fashion");
  await expect(page.locator(".collections-section")).toBeVisible();
  await expect(page.getByRole("link", { name: /Shop Men.s fashion collection/ }).first()).toHaveAttribute("href", /screen=fashion/);
  for (const unsupportedClaim of [
    "10,000+",
    "4.9 ★",
    "VERVEVIP",
    "Rs. 500 off",
    "Verified Fashion Buyer",
    "Standard Pakistani sizing across all De VERVE apparel",
    "2-4 Days",
    "Nationwide Express Delivery",
    "Free Delivery across Pakistan",
    "Flagship Store & Concierge Active",
  ]) {
    await expect(body).not.toContainText(unsupportedClaim);
  }
  await expect(page.locator(".newsletter-form")).toHaveCount(0);
  await expect(page.locator(".newsletter-section")).toHaveCount(0);
  await expect(page.locator(".customer-feedback-invite")).toHaveCount(0);

  // The screen-first layout exposes contact actions on the Contact screen, not in hidden sections.
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Contact", exact: true }).click();
  await expect(page.locator(".faq-section")).toBeVisible();
  await page.getByRole("button", { name: /How fast is shipping and what are the delivery charges/ }).click();
  await expect(page.locator(".faq-section")).toContainText("Delivery areas, charges and estimated timelines are confirmed by our team before dispatch.");
  await expect(page.locator(".contact-section")).toBeVisible();
  await expect(page.getByRole("link", { name: /Chat on WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\//);
});

test("owner-managed category artwork fully replaces the default category illustration", async ({ page }) => {
  const mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await page.route("**/api/storefront/settings", async route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ social_links: {}, brand_assets: {}, category_assets: { men: mediaId } }),
  }));
  await page.route("**/media/" + mediaId, async route => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#b9c8d8"/></svg>',
  }));
  await page.goto("/?screen=fashion");
  const artworkLink = page.getByTestId("collection-men-art");
  const artwork = artworkLink.locator(".category-custom-art");
  await expect(artwork).toHaveAttribute("src", "/media/" + mediaId);
  await expect(artwork).toBeVisible();
  await expect(artworkLink.locator(".category-garment")).toHaveCount(0);
  await expect(artworkLink.locator(".category-art-word")).toHaveCount(0);
  await expect(artworkLink.locator(".category-tag")).toBeVisible();
  await expect(artworkLink.locator(".category-arrow")).toBeVisible();
  await expect(artworkLink).toHaveAttribute("href", "/?screen=fashion&category=men");
});

test("category cards retain the original illustration only when no uploaded artwork exists", async ({ page }) => {
  await page.route("**/api/storefront/settings", async route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ social_links: {}, brand_assets: {}, category_assets: {} }),
  }));
  await page.goto("/?screen=fashion");
  const artworkLink = page.getByTestId("collection-women-art");
  await expect(artworkLink.locator(".category-garment")).toBeVisible();
  await expect(artworkLink.locator(".category-art-word")).toBeVisible();
  await expect(artworkLink.locator(".category-custom-art")).toHaveCount(0);
});

test("selected category opens a focused collection without repeating category cards above products", async ({ page }) => {
  await page.goto("/?screen=fashion&category=men");
  await expect(page.locator(".collections-section")).toBeVisible();
  await expect(page.locator(".collection-card")).toHaveCount(0);
  await expect(page.locator(".live-catalogue")).toBeVisible();
  await expect(page.locator(".live-catalogue-heading h3")).toContainText("men collection");
  await expect(page.getByRole("button", { name: /Clear category/ })).toBeVisible();
});

test("cart does not invent an unconfigured free-delivery threshold", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("deverve-cart", JSON.stringify([{
      variant_id: "11111111-1111-4111-8111-111111111111",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Threshold Test Hoodie", sku: "DV-THRESHOLD-M", size: "M", color: "Navy",
      quantity: 1, unit_price_paisa: 500000, available_quantity: 5,
    }]));
  });
  await page.goto("/");
  await page.locator(".header-cart").click();
  await expect(page.locator(".cart-shipping-info")).toContainText("Delivery charges are confirmed separately");
  await expect(page.locator(".cart-shipping-track-label")).toHaveCount(0);
  await expect(page.locator(".cart-shipping-unlocked")).toHaveCount(0);
});

test("cart does not promise spend-based discounts or free delivery at high subtotals", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("deverve-cart", JSON.stringify([{
      variant_id: "11111111-1111-4111-8111-111111111111",
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Promotion Test Hoodie", sku: "DV-PROMO-M", size: "M", color: "Navy",
      quantity: 1, unit_price_paisa: 2500000, available_quantity: 5,
    }]));
  });
  await page.goto("/");
  await page.locator(".header-cart").click();
  await expect(page.locator(".cart-shipping-info")).toContainText("No free-delivery offer is applied unless a valid voucher is shown");
  await expect(page.locator(".cart-shipping-unlocked")).toHaveCount(0);
  await expect(page.locator(".cart-shipping-track-label")).toHaveCount(0);
});

test("uses the uploaded brand logo as the browser tab icon when no dedicated favicon is set", async ({ page }) => {
  const logoId = "22222222-2222-4222-8222-222222222222";
  await page.route("**/api/storefront/settings", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ social_links: {}, brand_assets: { logo_id: logoId, favicon_id: null } }),
    });
  });
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", new RegExp("/api/brand/logo\\?v=" + logoId));
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", new RegExp("/api/brand/logo\\?v=" + logoId));
});

test("storefront keeps original English copy and does not expose the unreliable translator", async ({ page }) => {
  let translationRequests = 0;
  await page.route("**/api/translate", async route => {
    translationRequests += 1;
    await route.fulfill({ status: 410, contentType: "application/json", body: JSON.stringify({ error: "Website translation has been retired." }) });
  });
  await page.goto("/");
  await expect(page.locator(".announcement")).toBeVisible();
  await expect(page.locator(".announcement-services")).toHaveText("FASHION · WHOLESALE · CAR RENTALS");
  await expect(page.locator(".top-quote-strip p")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose website language" })).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search products, categories, vehicles and pages" })).toBeVisible();
  expect(translationRequests).toBe(0);
});

test("customer navigation menu closes on outside tap and Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await toggle.click();
  await expect(page.locator(".main-nav")).toHaveClass(/is-open/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".main-nav")).not.toHaveClass(/is-open/);
  await toggle.click();
  await expect(page.locator(".main-nav")).toHaveClass(/is-open/);
  await page.locator(".menu-dismiss").click({ position: { x: 8, y: 8 } });
  await expect(page.locator(".main-nav")).not.toHaveClass(/is-open/);
});

test("mobile quick-navigation ribbon stays fixed to the viewport bottom on every screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const screen of ["home", "fashion", "wholesale", "mobility", "contact", "favourites"]) {
    await page.goto(screen === "home" ? "/" : "/?screen=" + screen);
    const dock = page.locator(".mobile-dock");
    await expect(dock).toBeVisible();
    await expect(dock).toHaveCSS("position", "fixed");
    const before = await dock.boundingBox();
    expect(before).not.toBeNull();
    expect(Math.abs(before!.y + before!.height - 844)).toBeLessThanOrEqual(2);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(80);
    const after = await dock.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.y + after!.height - 844)).toBeLessThanOrEqual(2);
  }
});

test("AI attachment menu closes on outside tap and Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  const chat = page.getByRole("dialog", { name: "De VERVE AI customer support" });
  const plus = chat.getByRole("button", { name: "Add attachment" });
  await plus.click();
  await expect(chat.getByRole("menu", { name: "Attachment options" })).toBeVisible();
  await chat.locator(".ai-chat-head").click();
  await expect(chat.getByRole("menu", { name: "Attachment options" })).toHaveCount(0);
  await plus.click();
  await page.keyboard.press("Escape");
  await expect(chat.getByRole("menu", { name: "Attachment options" })).toHaveCount(0);
});

test("customer header search and AI support launcher remain usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose website language" })).toHaveCount(0);
  const headerLogo = page.locator(".site-header .brand-logo-image");
  await expect(headerLogo).toBeVisible();
  await expect(headerLogo).toHaveCSS("border-radius", "50%");
  const headerLogoBox = await headerLogo.boundingBox();
  expect(headerLogoBox).not.toBeNull();
  expect(headerLogoBox!.width / headerLogoBox!.height).toBeCloseTo(1, 1);
  const search = page.getByRole("searchbox", { name: "Search products, categories, vehicles and pages" });
  await expect(search).toBeVisible();
  await search.fill("wholesale");
  await expect(page.getByRole("listbox", { name: "Search results" })).toContainText("Wholesale enquiries");
  const launcher = page.getByRole("button", { name: "Open De VERVE AI chat" });
  await expect(launcher.locator("svg.ai-chat-launcher-icon")).toBeVisible();
  await launcher.click();
  await expect(page.getByRole("dialog", { name: "De VERVE AI customer support" })).toBeVisible();
  const logo = page.locator(".ai-chat-head .ai-chat-brand-logo");
  await expect(logo).toBeVisible();
  await expect(logo).toHaveCSS("border-radius", "50%");
  await expect(logo).toHaveCSS("width", "58px");
  await expect(logo).toHaveCSS("height", "58px");
  await expect(page.locator(".top-quote-strip p")).toBeVisible();
});

test("fast logo-only launch and customer AI logo use centered circular frames", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let quoteApiRequests = 0;
  const onlineQuotes = [
    { text: "You are your best thing.", author: "Toni Morrison" },
    { text: "Nothing will work unless you do.", author: "Maya Angelou" }
  ];
  await page.route("**/api/quotes/random*", async route => {
    const item = onlineQuotes[Math.min(quoteApiRequests, onlineQuotes.length - 1)];
    quoteApiRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(item) });
  });
  await page.route("**/api/pages/home", async route => {
    await new Promise(resolve => setTimeout(resolve, 900));
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
  });
  await page.route("**/api/brand/logo*", async route => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="#fff" stroke="#123f70" stroke-width="8"/><text x="100" y="112" text-anchor="middle" font-size="30" font-weight="700" fill="#123f70">DE</text><text x="100" y="142" text-anchor="middle" font-size="20" fill="#123f70">VERVE</text></svg>'
  }));
  await page.goto("/");
  // The logo-only HTML shell is removed as soon as React paints; no full-screen loading copy remains.
  await expect(page.locator("#initial-brand-loader")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".brand-loading-screen")).toHaveCount(0);
  await expect(page.locator(".site-shell")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Loading page…|Loading De VERVE/i);
  const mobileSearch = page.getByRole("searchbox", { name: "Search products, categories, vehicles and pages" });
  await expect(mobileSearch).toBeVisible();
  await expect(mobileSearch).toHaveAttribute("placeholder", "Explore DeVerve");
  const mobileSearchBox = await mobileSearch.boundingBox();
  expect(mobileSearchBox).not.toBeNull();
  expect(mobileSearchBox!.width).toBeGreaterThanOrEqual(130);
  await mobileSearch.fill("wholesale");
  const mobileSearchResult = page.locator(".site-search-results").getByRole("option").first();
  await expect(mobileSearchResult).toBeVisible();
  const mobileSearchResultBox = await mobileSearchResult.boundingBox();
  expect(mobileSearchResultBox).not.toBeNull();
  expect(mobileSearchResultBox!.height).toBeGreaterThanOrEqual(44);
  const launcher = page.getByRole("button", { name: "Open De VERVE AI chat" });
  await expect(launcher).toContainText("AI HELP");
  const launcherBox = await launcher.boundingBox();
  expect(launcherBox).not.toBeNull();
  expect(launcherBox!.width).toBeGreaterThanOrEqual(68);
  expect(launcherBox!.height).toBeGreaterThanOrEqual(68);
  const reservedBottomSpace = await page.locator(".site-shell").evaluate(element => parseFloat(getComputedStyle(element).paddingBottom));
  expect(reservedBottomSpace).toBeGreaterThanOrEqual(90);
  const dock = page.locator(".mobile-dock");
  if (await dock.isVisible()) {
    const dockBox = await dock.boundingBox();
    expect(dockBox).not.toBeNull();
    expect(launcherBox!.y + launcherBox!.height).toBeLessThan(dockBox!.y - 8);
  }

  await launcher.click();
  const chatLogo = page.locator(".ai-chat-head .ai-chat-brand-logo");
  await expect(chatLogo).toBeVisible();
  const chatLogoBox = await chatLogo.boundingBox();
  expect(chatLogoBox).not.toBeNull();
  expect(chatLogoBox!.width).toBeGreaterThanOrEqual(54);
  expect(chatLogoBox!.height).toBeGreaterThanOrEqual(54);
  expect(Math.abs(chatLogoBox!.width / chatLogoBox!.height - 1)).toBeLessThanOrEqual(0.03);
  await expect(chatLogo).toHaveCSS("border-radius", "50%");
  await expect(chatLogo).toHaveCSS("object-position", "50% 50%");
  const chat = page.getByRole("dialog", { name: "De VERVE AI customer support" });
  for (const control of [
    chat.getByRole("button", { name: "Add attachment" }),
    chat.getByRole("button", { name: "Speak your message" }),
    chat.getByRole("button", { name: "Send message" })
  ]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(48);
    expect(bounds!.height).toBeGreaterThanOrEqual(48);
  }

  const quote = page.locator(".top-quote-strip");
  await expect(quote.locator("p")).toHaveText(onlineQuotes[0].text);
  const firstQuoteText = (await quote.locator("p").innerText()).trim();
  await expect(quote.locator("cite")).toHaveText("— Toni Morrison");
  await expect(quote.getByRole("link")).toHaveCount(0);

  // Online quotes rotate on a fresh visit without exposing the upstream service brand.
  await page.reload();
  await expect(page.locator(".top-quote-strip p")).toHaveText(onlineQuotes[1].text);
  const nextQuoteText = (await page.locator(".top-quote-strip p").innerText()).trim();
  expect(nextQuoteText).not.toBe(firstQuoteText);
  await expect(page.locator(".top-quote-strip cite")).toHaveText("— Maya Angelou");
  await expect(page.locator(".top-quote-strip").getByRole("link")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("deverve:golden-quote:last:v1"))).toBe(nextQuoteText);
  expect(quoteApiRequests).toBe(2);

  const quoteFits = await quote.locator("p").evaluate(element => {
    const style = getComputedStyle(element);
    return element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= parseFloat(style.lineHeight) * 1.5;
  });
  expect(quoteFits).toBeTruthy();
  const shortQuoteIsSingleLine = await quote.locator("p").evaluate(element => {
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
    return element.getBoundingClientRect().height <= lineHeight * 1.5;
  });
  expect(shortQuoteIsSingleLine).toBeTruthy();
});

test("global search matches variant attributes and common policy keywords", async ({ page }) => {
  await page.route("**/api/products**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/products") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", slug: "navy-trouser-search", name: "Classic Trouser",
        description: "Everyday tailored fit", category: "Trousers", audience: "men", retail_price_paisa: 100000,
        image_key: null, seo_title: "Classic Trouser", seo_description: "Classic fit",
        variants: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", sku: "DV-NAV-M", size: "M", color: "Navy", available_quantity: 4 }],
        media: []
      }] })
    });
  });
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search products, categories, vehicles and pages" });
  await search.fill("navy m");
  await expect(page.getByRole("listbox", { name: "Search results" })).toContainText("Classic Trouser");
  await search.fill("shipping returns");
  await expect(page.getByRole("listbox", { name: "Search results" })).toContainText("Policies & FAQs");
  await search.fill("بچوں کے کپڑے");
  await expect(page.getByRole("listbox", { name: "Search results" })).toContainText("Kids' fashion");
});





test("AI speech detects and reads common Roman Urdu using an installed Urdu voice", async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: Array<{ text: string; lang: string }> = [];
    class MockUtterance {
      text: string; lang = ""; rate = 1; pitch = 1; voice: unknown = null;
      onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: MockUtterance, configurable: true });
    const voices = [{ name: "Urdu test voice", lang: "ur-PK", default: true, localService: true, voiceURI: "test-urdu" }, { name: "English test voice", lang: "en-US", default: false, localService: true, voiceURI: "test-english" }];
    const synth = {
      getVoices: () => voices,
      cancel: () => undefined,
      speak: (utterance: MockUtterance) => {
        spoken.push({ text: utterance.text, lang: utterance.lang });
        utterance.onstart?.();
        utterance.onend?.();
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    (window as Window & { __spoken?: Array<{ text: string; lang: string }> }).__spoken = spoken;
  });
  await page.route("**/api/quotes/random*", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.route("**/api/pages/home", route => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.route("**/api/ai/chat", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ reply: "Aap kaise hain, main theek hoon. I can help you today." })
  }));
  await page.route("**/api/ai/speech", route => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "speech temporarily unavailable" })
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  const chat = page.getByRole("dialog", { name: "De VERVE AI customer support" });
  await chat.getByRole("textbox", { name: "Your message" }).fill("Please reply in Roman Urdu.");
  await chat.getByRole("button", { name: "Send message" }).click();
  const assistantReply = page.locator(".ai-chat-message-wrap.model").last();
  await expect(assistantReply.locator("p")).toHaveText("Aap kaise hain, main theek hoon. I can help you today.");
  await assistantReply.getByRole("button", { name: "Speak message" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __spoken?: Array<{ text: string; lang: string }> }).__spoken?.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as Window & { __spoken?: Array<{ text: string; lang: string }> }).__spoken?.[0]?.lang)).toBe("ur-PK");
  await expect.poll(() => page.evaluate(() => (window as Window & { __spoken?: Array<{ text: string; lang: string }> }).__spoken?.[1]?.lang)).toBe("en-US");
  const spokenText = await page.evaluate(() => (window as Window & { __spoken?: Array<{ text: string; lang: string }> }).__spoken?.[0]?.text || "");
  expect(spokenText).toContain("آپ");
  expect(spokenText).toContain("کیسے");
  expect(spokenText).toContain("ہیں");
  expect(spokenText).toContain("ٹھیک");
  expect(spokenText).toContain("ہوں");
});


test("golden quote uses the online feed, rotates on refresh and never advertises the provider", async ({ page }) => {
  const onlineQuotes = [
    { text: "You are your best thing.", author: "Toni Morrison" },
    { text: "Nothing will work unless you do.", author: "Maya Angelou" }
  ];
  let requests = 0;
  await page.route("**/api/quotes/random*", async route => {
    const item = onlineQuotes[Math.min(requests, onlineQuotes.length - 1)];
    requests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(item) });
  });
  await page.route("**/api/pages/home", route => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.goto("/");
  const quote = page.locator(".top-quote-strip");
  await expect(quote.locator("p")).toHaveText("You are your best thing.");
  await expect(quote.locator("cite")).toHaveText("— Toni Morrison");
  await expect(quote.getByRole("link")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("DummyJSON");
  await page.reload();
  await expect(quote.locator("p")).toHaveText("Nothing will work unless you do.");
  await expect(quote.locator("cite")).toHaveText("— Maya Angelou");
  await expect(quote.getByRole("link")).toHaveCount(0);
});

test("golden quote uses the local De VERVE fallback when the online feed is unavailable", async ({ page }) => {
  await page.route("**/api/quotes/random*", route => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporarily unavailable" })
  }));
  await page.route("**/api/pages/home", route => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.goto("/");
  const quote = page.locator(".top-quote-strip");
  await expect(quote.locator("p")).toHaveText(/.+/);
  await expect(quote.locator("cite")).toHaveText("— DE VERVE");
  await expect(quote.getByRole("link")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("deverve:golden-quote:last:v1"))).not.toBeNull();
});

test("the pre-React shell shows only the canonical logo with no loading copy", async ({ page }) => {
  await page.route("**/src/main.tsx", route => route.abort());
  await page.route("**/*.js", route => route.abort());
  await page.goto("/");
  const initialLoader = page.locator("#initial-brand-loader");
  await expect(initialLoader).toBeVisible();
  await expect(initialLoader.locator("img.initial-brand-logo")).toHaveAttribute("src", "/api/brand/logo");
  await expect(initialLoader.locator("img")).toHaveCount(1);
  await expect(initialLoader).not.toContainText(/loading|elevate|de verve/i);
});

test("customer AI chat plays server-generated Urdu speech without requiring a device Urdu voice", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeSource {
      buffer: unknown = null;
      onended: (() => void) | null = null;
      connect() {}
      start() {
        (window as Window & { __serverTtsPlayed?: boolean }).__serverTtsPlayed = true;
        this.onended?.();
      }
      stop() {}
    }
    class FakeAudioContext {
      state = "running";
      destination = {};
      resume() { return Promise.resolve(); }
      decodeAudioData() { return Promise.resolve({ duration: 1 }); }
      createBufferSource() { return new FakeSource(); }
      close() { this.state = "closed"; return Promise.resolve(); }
    }
    Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true });
  });
  let speechRequest: { text?: string; language?: string; voice?: string } | null = null;
  await page.route("**/api/quotes/random*", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.route("**/api/pages/home", route => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.route("**/api/ai/chat", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ reply: "Aap kaise hain? Main aap ki madad kar sakta hoon." })
  }));
  await page.route("**/api/ai/speech", async route => {
    speechRequest = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from("RIFF0000WAVE") });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  const chat = page.getByRole("dialog", { name: "De VERVE AI customer support" });
  await chat.getByRole("combobox", { name: "Voice language" }).selectOption("ur-PK");
  await chat.getByRole("textbox", { name: "Your message" }).fill("Please reply in Roman Urdu.");
  await chat.getByRole("button", { name: "Send message" }).click();
  const assistantReply = page.locator(".ai-chat-message-wrap.model").last();
  await expect(assistantReply.locator("p")).toHaveText("Aap kaise hain? Main aap ki madad kar sakta hoon.");
  await assistantReply.getByRole("button", { name: "Speak message" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __serverTtsPlayed?: boolean }).__serverTtsPlayed)).toBe(true);
  expect(speechRequest).toMatchObject({ language: "ur-PK", voice: "Kore" });
  expect(speechRequest?.text).toContain("Aap kaise hain");
});


test("published CMS homepage restores the storefront header, search, golden quote and ending footer strip", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route("**/api/pages/home", async route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      page: { slug: "home", title: "A new home for De VERVE", seo_title: "De VERVE", seo_description: "Fashion, wholesale and mobility in Jhelum.", page_type: "home" },
      sections: [{ id: "hero-e2e", section_type: "hero", position: 0, is_visible: true, content: { eyebrow: "DE VERVE", heading: "Elevate your style", body: "Fashion, wholesale and mobility." } }],
    }),
  }));
  await page.route("**/api/navigation", async route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [
      { id: "home", label: "Home", href: "/", position: 0 },
      { id: "fashion", label: "Fashion", href: "/?screen=fashion", position: 1 },
      { id: "wholesale", label: "Wholesale", href: "/?screen=wholesale", position: 2 },
      { id: "mobility", label: "Car rental", href: "/?screen=mobility", position: 3 },
      { id: "contact", label: "Contact", href: "/?screen=contact", position: 4 },
    ] }),
  }));
  await page.route("**/api/quotes/random*", async route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ text: "Confidence is your best everyday style.", author: "De VERVE Editorial" }),
  }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A new home for De VERVE" })).toBeVisible();
  await expect(page.locator(".top-quote-strip")).toContainText("Confidence is your best everyday style.");
  await expect(page.locator(".top-quote-strip")).not.toContainText(/DummyJSON|provider/i);
  const search = page.getByRole("searchbox", { name: "Search products, categories, vehicles and pages" });
  await expect(search).toBeVisible();
  const searchBounds = await search.boundingBox();
  expect(searchBounds).not.toBeNull();
  expect(searchBounds!.width).toBeGreaterThanOrEqual(250);

  const menuButton = page.getByRole("button", { name: "Toggle navigation" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  const menu = page.getByRole("navigation", { name: "Main navigation" });
  await expect(menu.getByRole("link", { name: "Fashion" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Car rental" })).toBeVisible();
  await menuButton.click();
  await expect(menu).toBeHidden();

  await search.fill("hoodie");
  const result = page.locator("#public-site-search-results").getByRole("option", { name: /Hoodies & jackets/ });
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("href", /screen=fashion.*category=layers/);
  await search.fill("car rental");
  const rentalResult = page.locator("#public-site-search-results").getByRole("option", { name: /Car rental/ }).first();
  await expect(rentalResult).toBeVisible();
  await expect(rentalResult).toHaveAttribute("href", /screen=mobility/);
  await expect(page.locator(".public-page-footer-strip")).toContainText("ALL RIGHTS RESERVED");
  await expect(page.locator(".public-page-footer-strip")).toContainText("Syed Nabeel Wasti");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
