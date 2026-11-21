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
  await dialog.getByLabel(/I confirm these are my documents/).check();
  await submitButton.click();

  await expect(dialog.getByText("DV-R-TEST-123456789012")).toBeVisible();
  expect(submitted).toContain("cnic_front");
  expect(submitted).toContain("cnic_back");
  expect(submitted).toContain("cnic_consent");
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
  await dialog.getByLabel(/I confirm these are my documents/).check();
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
    await dialog.getByLabel(/I confirm these are my documents/).check();
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


test("install app control remains visible when the browser does not expose a native install prompt", async ({ page }) => {
  await page.goto("/");
  const installButton = page.getByRole("button", { name: "Install De VERVE app" });
  await expect(installButton).toBeVisible();
  await installButton.click();
  await expect(page.getByRole("dialog", { name: "Install De VERVE" })).toBeVisible();
});

test("AI chat sends only real alternating conversation turns to Gemini", async ({ page }) => {
  const submitted: { payload: { messages: Array<{ role: string; text: string }>; images?: unknown[] } | null } = { payload: null };
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
  expect(submitted.payload?.images).toEqual([]);
});

test("customer AI chat exposes accessible photo, voice input and spoken response controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  await expect(page.getByRole("button", { name: "Speak your message" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Listen to latest response" })).toBeVisible();
  await expect(page.getByText("＋ Photo")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Voice recognition language" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse garments" })).toHaveAttribute("href", "/?screen=fashion");
  await expect(page.getByRole("link", { name: "Wholesale enquiry" })).toHaveAttribute("href", "/?screen=wholesale");
  await expect(page.getByRole("link", { name: "Car rental" })).toHaveAttribute("href", "/?screen=mobility");
  await expect(page.getByRole("link", { name: "Contact team" })).toHaveAttribute("href", "/?screen=contact");
  await expect(page.getByRole("link", { name: "My account" })).toHaveAttribute("href", "/account");
});


test("customer AI chat compresses and sends an attached product photo", async ({ page }) => {
  const submitted: { images?: Array<{ name: string; mime_type: string; data: string }> } = {};
  await page.route("**/api/ai/chat", async route => {
    Object.assign(submitted, route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "I can inspect the visible garment details." }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  await page.locator(".ai-chat-panel input[type=file]").setInputFiles({
    name: "garment-label.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF8sAAAAASUVORK5CYII=", "base64")
  });
  await expect(page.getByAltText("Photo attachment 1")).toBeVisible();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("I can inspect the visible garment details.")).toBeVisible();
  expect(submitted.images).toHaveLength(1);
  expect(submitted.images?.[0].mime_type).toBe("image/jpeg");
  expect(submitted.images?.[0].data.startsWith("/9j/")).toBeTruthy();
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
  await expect(page.locator(".trust-pillars-section")).toHaveCount(0);
  await expect(page.locator(".intro-strip")).toHaveCount(0);
  await expect(page.locator(".collections-section")).toHaveCount(1);
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
  await expect(page.locator(".testimonial-card")).toHaveCount(0);
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
