import { test, expect, type Page } from "@playwright/test";

const owner = { id: "11111111-1111-4111-8111-111111111111", email: "owner@deverve.test", role: "owner" };
const vehicleId = "22222222-2222-4222-8222-222222222222";
const rentalId = "33333333-3333-4333-8333-333333333333";

async function mockAdminApi(page: Page, options: { rental?: Record<string, unknown> } = {}) {
  let rental = options.rental ?? null;
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let payload: Record<string, unknown> = {
      products: [],
      overview: { published_products: 0, draft_products: 0, new_enquiries: 0, pending_orders: 0, rental_requests: 0 },
      users: [],
      invites: [],
      settings: {},
      enquiries: [],
      customers: [],
      orders: [],
      returns: [],
      exchanges: [],
      quotes: [],
      vehicles: [{
        id: vehicleId, name: "Toyota Corolla 2022", vehicle_type: "Sedan", transmission: "Automatic",
        seats: 5, fuel_type: "Petrol", daily_rate_paisa: 1200000, with_driver_daily_rate_paisa: 1500000,
        status: "available", image_key: null, description: "Test fleet vehicle",
      }],
      rentals: rental ? [rental] : [],
      reviews: [],
      events: [],
      items: [],
      accounts: [],
      registers: [],
      session: null,
      has_more: false,
    };

    if (url.pathname === "/api/admin/me") {
      payload = { admin: owner };
    } else if (url.pathname === "/api/admin/rentals" && method === "GET") {
      payload = { rentals: rental ? [rental] : [] };
    } else if (url.pathname === "/api/admin/rentals/" + rentalId && method === "PATCH") {
      const body = request.postDataJSON() as { status: string; vehicle_id: string | null; admin_note: string };
      if (rental) rental = { ...rental, status: body.status, vehicle_id: body.vehicle_id, admin_note: body.admin_note, vehicle_name: body.vehicle_id ? "Toyota Corolla 2022" : null };
      payload = { updated: true, status: body.status, vehicle_id: body.vehicle_id };
    } else if (url.pathname === "/api/admin/product-reviews") {
      payload = { reviews: [] };
    } else if (url.pathname === "/api/admin/audit-logs") {
      payload = { events: [], has_more: false };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

test("direct links load product review and audit workspace data", async ({ page }) => {
  await mockAdminApi(page);

  const reviewsRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/admin/product-reviews" && request.method() === "GET"
  );
  await page.goto("/admin?section=product-reviews");
  await reviewsRequest;
  await expect(page.getByRole("heading", { name: "Product reviews & comments" })).toBeVisible();
  await expect(page.getByText("No pending moderation items")).toBeVisible();

  const auditRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/admin/audit-logs" && request.method() === "GET"
  );
  await page.goto("/admin?section=audit");
  await auditRequest;
  await expect(page.getByRole("heading", { name: "Business activity history" })).toBeVisible();
  await expect(page.getByText("No recorded activity yet")).toBeVisible();
});

test("rental vehicle assignment and internal note can be saved without changing status", async ({ page }) => {
  const rental = {
    id: rentalId, reference_code: "DV-R-TEST-0001", vehicle_id: null, vehicle_name: null, vehicle_type: null,
    customer_name: "Browser Rental Customer", phone: "+923001234567", email: "customer@example.com",
    pickup_location: "Jhelum", pickup_city: "Jhelum", pickup_address: "Main Road, Jhelum",
    destination: "Lahore", destination_city: "Lahore", destination_address: "Mall Road, Lahore",
    pickup_at: "2026-11-25T09:00:00.000Z", return_at: "2026-11-26T09:00:00.000Z",
    driver_option: "self_drive", rental_days: 1, estimated_daily_rate_paisa: 1200000,
    estimated_total_paisa: 1200000, status: "reviewing", admin_note: "",
    cnic_front_uploaded: 1, cnic_back_uploaded: 1, created_at: "2026-11-18T09:00:00.000Z",
  };
  await mockAdminApi(page, { rental });

  const updateRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/admin/rentals/" + rentalId && request.method() === "PATCH"
  );
  await page.goto("/admin?section=rentals");
  const card = page.locator(".admin-rental-card").filter({ hasText: "DV-R-TEST-0001" });
  await expect(card).toBeVisible();
  await card.getByLabel("Assign vehicle").selectOption(vehicleId);
  await card.getByLabel("Internal note").fill("Vehicle availability checked and assignment confirmed with the team.");
  await card.getByRole("button", { name: "Save assignment & note" }).click();

  const request = await updateRequest;
  expect(request.postDataJSON()).toMatchObject({
    status: "reviewing",
    vehicle_id: vehicleId,
    admin_note: "Vehicle availability checked and assignment confirmed with the team.",
  });
  await expect(card.getByLabel("Assign vehicle")).toHaveValue(vehicleId);
  await expect(page.getByRole("status")).toContainText("Assignment and internal details saved");

  await page.route("**/api/admin/rentals/" + rentalId + "/documents/**", async route => {
    const side = new URL(route.request().url()).pathname.split("/").pop() || "cnic_front";
    await route.fulfill({status:200,contentType:"image/png",headers:{"cache-control":"private, no-store"},body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=","base64")});
  });
  page.on("dialog", dialog => dialog.accept("Test-Backup-Password-2026!"));
  const backupDownload = page.waitForEvent("download");
  await card.getByRole("button", {name:"Create encrypted backup"}).click();
  const backup = await backupDownload;
  expect(backup.suggestedFilename()).toMatch(/DV-R-TEST-0001-cnic-evidence\.dvbackup$/);
  const backupPath = await backup.path();
  expect(backupPath).toBeTruthy();

  const chooserPromise = page.waitForEvent("filechooser");
  await card.getByRole("button", {name:"Restore backup"}).click();
  const chooser = await chooserPromise;
  const restoredDownloadPromise = page.waitForEvent("download");
  await chooser.setFiles(backupPath!);
  const restoredDownload = await restoredDownloadPromise;
  await expect(card.getByRole("status")).toContainText("Backup decrypted and integrity-checked");
  expect(restoredDownload.suggestedFilename()).toMatch(/DV-R-TEST-0001-cnic_(front|back)\.(jpg|png|webp)$/);
});

test("saved draft CMS pages can be previewed through the authenticated admin endpoint", async ({ page }) => {
  const id = "44444444-4444-4444-8444-444444444444";
  await page.route("**/api/admin/pages/" + id, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: { id, slug: "private-draft", title: "Private draft preview", seo_title: "Private draft preview", seo_description: "Draft preview description", status: "draft" },
        sections: [{ id: "55555555-5555-4555-8555-555555555555", section_type: "hero", position: 0, is_visible: true, content: { eyebrow: "COLLECTION", heading: "A saved draft heading", body: "This is preview-only content." } }],
      }),
    });
  });
  await page.goto("/pages/private-draft?preview=1&id=" + id);
  await expect(page.getByText("Draft preview", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Private draft preview" })).toBeVisible();
  await expect(page.getByText("This is preview-only content.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to website editor" })).toBeVisible();
});


test("CMS editor uploads gallery media, edits section-specific content and reorders navigation", async ({ page }) => {
  const pageId = "66666666-6666-4666-8666-666666666666";
  const mediaId = "77777777-7777-4777-8777-777777777777";
  let savedPage: Record<string, unknown> | null = null;
  let savedNavigation: Array<Record<string, unknown>> = [];
  await mockAdminApi(page);
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === "/api/admin/pages" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ pages: [{ id: pageId, slug: "cms-test", title: "CMS test page", page_type: "standard", status: "draft", seo_title: "CMS test", seo_description: "CMS test description", updated_at: "2026-11-18T09:00:00.000Z" }] }) });
    } else if (url.pathname === "/api/admin/pages/" + pageId && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ page: { id: pageId, slug: "cms-test", title: "CMS test page", page_type: "standard", status: "draft", seo_title: "CMS test", seo_description: "CMS test description", updated_at: "2026-11-18T09:00:00.000Z" }, sections: [] }) });
    } else if (url.pathname === "/api/admin/navigation" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: "88888888-8888-4888-8888-888888888888", label: "Home", href: "/", position: 0, is_visible: true }, { id: "99999999-9999-4999-8999-999999999999", label: "Fashion", href: "/?screen=fashion", position: 1, is_visible: true }] }) });
    } else if (url.pathname === "/api/admin/media" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ media: [] }) });
    } else if (url.pathname === "/api/admin/media" && method === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ media: { id: mediaId, media_type: "image", mime_type: "image/png", byte_size: 120, alt_text: "CMS gallery image", caption: "", status: "ready" } }) });
    } else if (url.pathname === "/api/admin/navigation" && method === "PUT") {
      savedNavigation = (request.postDataJSON() as { items: Array<Record<string, unknown>> }).items;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated: true, items: savedNavigation }) });
    } else if (url.pathname === "/api/admin/pages/" + pageId && method === "PATCH") {
      savedPage = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated: true, status: (savedPage.status as string), revision: 1 }) });
    } else {
      await route.fallback();
    }
  });

  await page.goto("/admin?section=content");
  await expect(page.getByRole("heading", { name: "Pages & visual builder" })).toBeVisible();
  await page.getByRole("button", { name: /CMS test page/ }).click();
  await expect(page.getByRole("heading", { name: "CMS test page" }).first()).toBeVisible();
  await page.getByLabel("Add section type").selectOption("image_gallery");
  const block = page.locator(".content-block").last();
  await expect(block.locator(".content-block-head strong")).toHaveText("Image gallery");
  await block.getByLabel("Heading").fill("Campaign gallery");
  await block.locator('input[type="file"][multiple][aria-label="Upload gallery images"]').setInputFiles({ name: "campaign.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=", "base64") });
  await expect(block.locator(".content-gallery-preview img")).toHaveCount(1);

  await page.getByRole("button", { name: "Move navigation item down" }).first().click();
  await page.getByLabel("Visible").first().uncheck();
  await page.getByRole("button", { name: "Save navigation" }).click();
  await expect(page.getByRole("status")).toContainText("Navigation saved");
  expect(savedNavigation[0].label).toBe("Fashion");
  expect(savedNavigation[0].is_visible).toBe(false);

  const saveRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/admin/pages/" + pageId && request.method() === "PATCH");
  await page.getByRole("button", { name: "Save draft" }).click();
  await saveRequest;
  expect(savedPage).not.toBeNull();
  const sections = savedPage?.sections as Array<{ section_type: string; content: Record<string, string> }>;
  expect(sections[0].section_type).toBe("image_gallery");
  expect(sections[0].content.images).toBe("/media/" + mediaId);
});

test("public CMS pages render gallery, video, product, category and FAQ blocks", async ({ page }) => {
  const imageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const videoId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await page.route("**/api/pages/cms-render-test", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: { slug: "cms-render-test", title: "CMS rendering test", seo_title: "CMS rendering test", seo_description: "Public content blocks test" },
        sections: [
          { id: "1", section_type: "image_gallery", position: 0, content: { heading: "Gallery block", images: "/media/" + imageId } },
          { id: "2", section_type: "video", position: 1, content: { heading: "Video block", video_url: "/media/" + videoId, video_caption: "Campaign film" } },
          { id: "3", section_type: "product_collection", position: 2, content: { heading: "Featured products", limit: "3" } },
          { id: "4", section_type: "category_grid", position: 3, content: { heading: "Shop categories", categories: "Men\nWomen" } },
          { id: "5", section_type: "faq", position: 4, content: { heading: "Common questions", faqs: "What sizes? | Contact our team for current availability." } },
        ],
      }),
    });
  });
  await page.route("**/api/navigation", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: "nav1", label: "New arrivals", href: "/?screen=fashion", position: 0 }] }) }));
  await page.route((url) => new URL(url).pathname === "/api/products", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [{ id: "product1", slug: "test-hoodie", name: "Test hoodie", category: "Hoodies", retail_price_paisa: 250000, image_key: null, media: [] }] }) });
  });
  await page.goto("/pages/cms-render-test");
  await expect(page.getByRole("heading", { name: "CMS rendering test" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gallery block" })).toBeVisible();
  await expect(page.locator("video.public-video")).toBeVisible();
  await expect(page.getByRole("link", { name: /Test hoodie/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shop categories" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Men/ })).toHaveAttribute("href", "/?screen=fashion&category=Men");
  await expect(page.getByText("What sizes?")).toBeVisible();
  await expect(page.getByRole("link", { name: "New arrivals" })).toBeVisible();
});

test("a published CMS homepage replaces the default storefront homepage", async ({ page }) => {
  await page.route("**/api/pages/home", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ page: { slug: "welcome", title: "De VERVE CMS homepage", seo_title: "De VERVE", seo_description: "Welcome" }, sections: [{ id: "home-hero", section_type: "hero", position: 0, content: { heading: "A new home for De VERVE", body: "CMS homepage is live." } }] }) });
  });
  await page.route("**/api/navigation", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "De VERVE CMS homepage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A new home for De VERVE" })).toBeVisible();
  await expect(page.getByText("CMS homepage is live.")).toBeVisible();
});

test("POS camera scanner requests browser permission only after an explicit user action", async ({ page }) => {
  await mockAdminApi(page);
  await page.addInitScript(() => {
    const state = window as Window & { __cameraRequestCount?: number };
    state.__cameraRequestCount = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          state.__cameraRequestCount = (state.__cameraRequestCount ?? 0) + 1;
          throw Object.assign(new Error("Camera permission blocked"), { name: "NotAllowedError" });
        },
      },
    });
  });

  await page.goto("/admin?section=pos");
  await page.getByRole("button", { name: "Camera scan" }).click();
  await expect(page.getByRole("dialog", { name: "Scan product barcode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Allow camera access & start scanning" })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __cameraRequestCount?: number }).__cameraRequestCount ?? 0)).toBe(0);

  await page.getByRole("button", { name: "Allow camera access & start scanning" }).click();
  await expect(page.getByRole("alert")).toContainText("Camera access was blocked");
  expect(await page.evaluate(() => (window as Window & { __cameraRequestCount?: number }).__cameraRequestCount ?? 0)).toBe(1);
  await expect(page.getByRole("button", { name: "Try camera again" })).toBeVisible();
});
