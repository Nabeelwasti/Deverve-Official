import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const owner = { id: "11111111-1111-4111-8111-111111111111", email: "owner@deverve.test", role: "owner" };
const vehicleId = "22222222-2222-4222-8222-222222222222";
const rentalId = "33333333-3333-4333-8333-333333333333";

async function mockAdminApi(page: Page, options: { rental?: Record<string, unknown>; inventory?: Record<string, unknown> } = {}) {
  await page.route("**/api/brand/logo*", route => route.fulfill({
    status: 200, contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="564" height="114" viewBox="0 0 564 114"><rect width="564" height="114" fill="#fff"/><text x="12" y="78" font-size="64" fill="#123f70">DE VERVE</text></svg>'
  }));
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

    if (url.pathname === "/api/admin/ai/execute") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, action: null, message: "I can help with that. Tell me a little more about what you need." }) });
      return;
    } else if (url.pathname === "/api/admin/me") {
      payload = { admin: owner };
    } else if (url.pathname === "/api/admin/rentals" && method === "GET") {
      payload = { rentals: rental ? [rental] : [] };
    } else if (url.pathname === "/api/admin/rentals/" + rentalId && method === "PATCH") {
      const body = request.postDataJSON() as { status: string; vehicle_id: string | null; admin_note: string };
      if (rental) rental = { ...rental, status: body.status, vehicle_id: body.vehicle_id, admin_note: body.admin_note, vehicle_name: body.vehicle_id ? "Toyota Corolla 2022" : null };
      payload = { updated: true, status: body.status, vehicle_id: body.vehicle_id };
    } else if (url.pathname === "/api/admin/inventory") {
      payload = options.inventory ?? { items: [], summary: { variants: 0, stock_units: 0, reserved_units: 0, available_units: 0, low_stock_variants: 0, out_of_stock_variants: 0 } };
    } else if (url.pathname === "/api/admin/ai/keys") {
      payload = { keys: [], environment_keys: [], encryption_ready: true, encryption_mode: "dedicated", model: "Gemini 3.8 Flash", models: [] };
    } else if (url.pathname === "/api/admin/product-reviews") {
      payload = { reviews: [] };
    } else if (url.pathname === "/api/admin/audit-logs") {
      payload = { events: [], has_more: false };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

test("admin navigation menus render as independent floating popovers outside the sidebar", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin?section=overview");
  await page.getByText("Operations", { exact: true }).click();
  const menu = page.locator("body > .admin-ribbon-popover");
  await expect(menu).toBeVisible();
  expect(await menu.evaluate(el => el.parentElement === document.body)).toBe(true);
  await expect(menu.getByRole("button", { name: "Products & variants" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("product creation stays inside the catalogue workspace and exposes broad size and colour suggestions", async ({ page }) => {
  await mockAdminApi(page);
  await page.route("**/api/admin/products", async route => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/admin/products/research", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, summary: "Exact product identity is not fully verified. The official brand page shows a cotton-blend hoodie with a regular fit.", sources: [{ title: "Official product page", url: "https://example.com/product" }], queries: ["Palette test hoodie official"], model: "gemini-3.8-flash" }) });
  });
  let bulkPayload: { variants: Array<{size:string;color:string;initial_stock:number;reorder_level:number}> } | null = null;
  await page.route("**/api/admin/products/*/variants/bulk", async route => {
    bulkPayload = route.request().postDataJSON();
    const variants = (bulkPayload?.variants ?? []).map((item,index) => ({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-" + String(index).padStart(12,"0"),
      product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sku: "DV-MATRIX-" + index,
      size: item.size, color: item.color, stock_on_hand: item.initial_stock,
      reserved_quantity: 0, available_quantity: item.initial_stock, barcode: "2000000000000",
      reorder_level: item.reorder_level, is_active: 1
    }));
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ created: variants.length, atomic: true, variants }) });
  });
  await page.goto("/admin?section=products");
  await expect(page.getByRole("heading", { name: "Product catalogue" })).toBeVisible();
  await expect(page.locator(".admin-topbar .admin-brand-logo")).toHaveAttribute("src", "/api/brand/logo");
  await expect(page.locator(".admin-topbar").getByRole("button", { name: /Add product/ })).toHaveCount(0);
  const addProductActions = page.locator(".admin-add-product-button");
  await expect(addProductActions).toHaveCount(2);
  for (const action of await addProductActions.all()) {
    await expect(action).toBeVisible();
    await expect(action.locator(".admin-add-product-label")).toHaveText("Add product");
    await expect(action.locator(".admin-add-product-label")).toHaveCSS("visibility", "visible");
  }
  await page.getByRole("button", { name: "Create with AI" }).click();
  await expect(page.locator(".admin-dashboard")).toHaveAttribute("data-admin-screen", "ai");
  await expect(page.locator(".admin-ai-chat-context").getByRole("heading", { name: "How can I help today?" })).toBeVisible();
  await page.getByRole("button", { name: "Open chat menu" }).click();
  await page.getByRole("button", { name: "Manual product entry" }).click();
  await page.getByLabel("Product name").fill("Palette test hoodie");
  await page.getByLabel("Category").fill("Hoodies");
  await expect(page.getByLabel("Default purchase cost (PKR)")).toBeVisible();
  await page.getByRole("button", { name: "Research product online" }).click();
  await expect(page.getByText(/Exact product identity is not fully verified/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Official product page" })).toHaveAttribute("href", "https://example.com/product");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("dialog", { name: "Palette test hoodie" })).toBeVisible();
  await expect(page.getByText("Bulk size & colour stock matrix")).toBeVisible();
  await expect(page.locator("#deverve-size-options option[value='10XL']")).toHaveCount(1);
  await expect(page.locator("#deverve-size-options option[value='48 EU']")).toHaveCount(1);
  await expect(page.locator("#deverve-colour-options option[value='Rebecca Purple']")).toHaveCount(1);
  await expect(page.locator("#deverve-colour-options option[value='Oxblood']")).toHaveCount(1);
  await expect(page.locator("input[list='deverve-size-options']")).toHaveCount(2);
  await expect(page.locator("input[list='deverve-colour-options']")).toHaveCount(2);
  await page.getByLabel("Browse full size list").selectOption("10XL");
  await page.getByRole("button", { name: "Add size" }).click();
  await page.getByLabel("Browse full colour list").selectOption("Oxblood");
  await page.getByRole("button", { name: "Add colour" }).click();
  await expect(page.locator("input[list='deverve-size-options']").first()).toHaveValue(/10XL/);
  await expect(page.locator("input[list='deverve-colour-options']").first()).toHaveValue(/Oxblood/);
  await page.getByRole("button", { name: "Generate combinations" }).click();
  await expect(page.getByLabel("Opening quantity 10XL Oxblood")).toBeVisible();
  await expect(page.getByRole("button", { name: /Save all \d+ variants/ })).toBeVisible();
  await page.getByLabel("Opening quantity 10XL Oxblood").fill("7");
  const bulkRequest = page.waitForRequest(request => new URL(request.url()).pathname.endsWith("/variants/bulk") && request.method() === "POST");
  await page.getByRole("button", { name: /Save all \d+ variants/ }).click();
  await bulkRequest;
  expect(bulkPayload?.variants).toEqual(expect.arrayContaining([expect.objectContaining({size:"10XL",color:"Oxblood",initial_stock:7})]));
  await expect(page.getByRole("status")).toContainText("All");
  await expect(page.getByRole("status")).toContainText("variants were saved together");
});


test("AI Command Centre analyses chat images and creates a reviewed unpublished product draft", async ({ page }) => {
  await mockAdminApi(page);
  let chatPayload: Record<string, unknown> | null = null;
  let productPayload: Record<string, unknown> | null = null;
  let createdProduct: Record<string, unknown> | null = null;
  let attachedMedia = false;
  await page.route("**/api/admin/ai/assistant", async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.task === "product") {
      productPayload = body;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ok: true, reply: "I prepared a draft from the visible product details.",
        model: "gemini-3.8-flash",
        product_draft: {
          name: "Everyday Hoodie", category: "Hoodies", audience: "unisex",
          description: "A casual hoodie with a front pocket and ribbed cuffs.",
          retail_price_pkr: null, wholesale_price_pkr: null, seo_title: "Everyday Hoodie",
          seo_description: "Casual hoodie", brand: null, material: null, barcode: null, sku: null,
          sizes: ["M"], colours: ["Black"],
          variants: [{ size: "M", color: "Black", initial_stock: 0, reorder_level: 5, cost_price_pkr: null }],
          unknowns: ["Confirm fabric composition and actual stock."]
        }
      }) });
    } else {
      chatPayload = body;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply: "I can analyse the attached product image.", model: "gemini-3.8-flash" }) });
    }
  });
  await page.route("**/api/admin/products", async route => {
    if (route.request().method() === "POST") {
      createdProduct = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) });
    } else await route.fallback();
  });
  await page.route("**/api/admin/products/*/variants/bulk", async route => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ created: 1, atomic: true, variants: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] }) });
  });
  await page.route("**/api/admin/media/bulk", async route => {
    if (route.request().method() === "POST") await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uploaded: 1, failed: 0, media: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", status: "ready", reused: false }], failures: [] }) });
    else await route.fallback();
  });
  await page.route("**/api/admin/products/*/media", async route => {
    if (route.request().method() === "POST") { attachedMedia = true; await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ attached: true }) }); }
    else await route.fallback();
  });

  await page.goto("/admin?section=ai");
  await expect(page.locator(".admin-dashboard")).toHaveAttribute("data-admin-screen", "ai");
  await expect(page.locator(".admin-ai-chat-context").getByRole("heading", { name: "How can I help today?" })).toBeVisible();
  const image = { name: "hoodie.png", mimeType: "image/png", buffer: Buffer.from("fake-image-data") };
  await page.locator(".admin-ai-attach input").setInputFiles(image);
  await page.getByPlaceholder("Message De VERVE Assistant…").fill("Please describe this hoodie.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("I can analyse the attached product image.")).toBeVisible();
  expect((chatPayload?.images as unknown[])?.length).toBe(1);

  await page.locator(".admin-ai-attach input").setInputFiles(image);
  await page.getByRole("button", { name: "Open chat menu" }).click();
  await page.getByRole("button", { name: /Product & file analysis/ }).click();
  await page.getByPlaceholder(/Describe what to extract/).fill("Analyse these garment photos and prepare a product draft.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("heading", { name: "Prepared product draft" })).toBeVisible();
  expect((productPayload?.images as unknown[])?.length).toBe(1);
  await page.getByRole("button", { name: "Create product draft & upload images" }).click();
  await expect(page.locator(".admin-ai-live-status")).toContainText("Draft created successfully");
  expect(createdProduct?.status).toBe("draft");
  expect(attachedMedia).toBe(true);
});

test("AI catalogue intake analyses all 100 selected images across resumable batches and a whole-set visual plan", async ({ page }) => {
  await mockAdminApi(page);
  let productBatches = 0;
  let chunkPlans = 0;
  let finalSheetCount = 0;
  let maximumImagesPerBatch = 0;
  await page.route("**/api/admin/ai/assistant", async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const images = Array.isArray(body.images) ? body.images as Array<{ name: string }> : [];
    if (body.task === "product") {
      productBatches++;
      maximumImagesPerBatch = Math.max(maximumImagesPerBatch, images.length);
      const drafts = images.map(image => ({
        name: "Catalogue hoodie " + productBatches,
        category: "Hoodies",
        audience: "unisex",
        description: "A test garment candidate.",
        retail_price_pkr: null,
        wholesale_price_pkr: null,
        seo_title: "Catalogue hoodie",
        seo_description: "Test catalogue hoodie",
        sizes: ["M"],
        colours: ["Black"],
        source_files: [image.name],
        variants: [{ size: "M", color: "Black", initial_stock: 0, reorder_level: 5, cost_price_pkr: null }],
        unknowns: ["Confirm actual price and stock."]
      }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply: "Analysed this image batch.", model: "gemini-test", product_drafts: drafts }) });
      return;
    }
    const messages = Array.isArray(body.messages) ? body.messages as Array<{ text?: string }> : [];
    if (messages.some(message => String(message.text || "").includes("labelled visual contact-sheet overview"))) {
      finalSheetCount = images.length;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply: JSON.stringify({ groups: [] }), model: "gemini-test" }) });
      return;
    }
    chunkPlans++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply: JSON.stringify({ groups: [] }), model: "gemini-test" }) });
  });

  await page.goto("/admin?section=ai");
  await expect(page.locator(".admin-dashboard")).toHaveAttribute("data-admin-screen", "ai");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
  const files = Array.from({ length: 100 }, (_, index) => ({
    name: "catalogue-" + String(index + 1).padStart(3, "0") + ".png",
    mimeType: "image/png",
    buffer: png
  }));
  await page.locator(".admin-ai-attach input").setInputFiles(files);
  await expect(page.locator(".admin-ai-attachments figure")).toHaveCount(100);
  await page.getByRole("button", { name: "Open chat menu" }).click();
  await page.getByRole("button", { name: /Product & file analysis/ }).click();
  await page.getByPlaceholder(/Describe what to extract/).fill("Analyse this batch of catalogue images.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("heading", { name: "Prepared product draft" })).toBeVisible({ timeout: 60000 });
  expect(productBatches).toBe(34);
  expect(finalSheetCount).toBe(7);
  expect(chunkPlans).toBe(9);
  expect(maximumImagesPerBatch).toBe(3);
});

test("AI chat uses a slide-in inbox menu for conversations and tools", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin?section=ai");
  await expect(page.locator(".admin-ai-inbox-shell")).toBeVisible();
  await expect(page.getByPlaceholder("Message De VERVE Assistant…")).toBeVisible();
  await page.getByRole("button", { name: "Open chat menu" }).click();
  await expect(page.getByRole("complementary", { name: "Chat menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start a new conversation/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /General assistant/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Product & file analysis/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Deep research/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Orders & payments/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Website settings/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".admin-ai-drawer")).not.toHaveClass(/is-open/);
  await page.getByRole("button", { name: "Open chat menu" }).click();
  await page.getByRole("button", { name: /Deep research/ }).click();
  await expect(page.locator(".admin-ai-chat-context")).toContainText("Research with sources");
  await expect(page.locator(".admin-ai-drawer")).not.toHaveClass(/is-open/);
});

test("owner can publish a product through natural language in the normal chat composer", async ({ page }) => {
  await mockAdminApi(page);
  let executed: Record<string, unknown> | null = null;
  await page.route("**/api/admin/ai/execute", async route => {
    executed = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, action: "publish_product", published: 1,
      message: "Published Everyday Hoodie directly to the live catalogue."
    }) });
  });
  await page.goto("/admin?section=ai");
  await page.getByPlaceholder("Message De VERVE Assistant…").fill("Please publish the Everyday Hoodie on the website.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".admin-ai-live-status")).toContainText("Published Everyday Hoodie directly");
  expect(executed).toMatchObject({ command: "Please publish the Everyday Hoodie on the website.", task_id: expect.any(String), messages: expect.any(Array) });
});

test("owner can request an order status transition through natural language", async ({ page }) => {
  await mockAdminApi(page);
  let executed: Record<string, unknown> | null = null;
  await page.route("**/api/admin/ai/execute", async route => {
    executed = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, action: "update_order_status", order_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      status: "confirmed", message: "Updated the order to confirmed through the guarded order workflow."
    }) });
  });
  await page.goto("/admin?section=ai");
  await page.getByPlaceholder("Message De VERVE Assistant…").fill("Mark order dddddddd-dddd-4ddd-8ddd-dddddddddddd status to confirmed");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".admin-ai-live-status")).toContainText("Updated the order to confirmed");
  expect(executed).toMatchObject({ command: "Mark order dddddddd-dddd-4ddd-8ddd-dddddddddddd status to confirmed", task_id: expect.any(String), messages: expect.any(Array) });
});

test("women and kids collection cards open their correctly filtered live catalogues", async ({ page }) => {
  const products = [
    { id: "women-product", slug: "women-hoodie", name: "Women Hoodie", description: "Women fit", category: "Hoodie", audience: "women", retail_price_paisa: 250000, variants: [], media: [] },
    { id: "kids-product", slug: "kids-shirt", name: "Kids Shirt", description: "Kids fit", category: "Shirt", audience: "kids", retail_price_paisa: 150000, variants: [], media: [] },
    { id: "men-product", slug: "men-trouser", name: "Men Trouser", description: "Men fit", category: "Trouser", audience: "men", retail_price_paisa: 300000, variants: [], media: [] },
  ];
  await page.route("**/api/pages/home", async route => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No published CMS homepage in this isolated storefront test." }) }));
  await page.route("**/api/products*", async route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ products }),
  }));
  await page.route("**/api/storefront/settings", async route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({}),
  }));
  await page.goto("/");
  await page.getByRole("button", { name: /Explore fashion/ }).click();
  await expect(page.getByTestId("collection-women-art")).toHaveAttribute("href", "/?screen=fashion&category=women");
  await page.getByTestId("collection-women-art").click();
  await expect(page).toHaveURL(/category=women/);
  await expect(page.getByRole("heading", { name: "Women Hoodie" })).toBeVisible();
  await expect(page.getByText("Kids Shirt", { exact: true })).toHaveCount(0);
  await page.goto("/");
  await page.getByRole("button", { name: /Explore fashion/ }).click();
  await expect(page.getByTestId("collection-kids-art")).toHaveAttribute("href", "/?screen=fashion&category=kids");
  await page.getByTestId("collection-kids-art").click();
  await expect(page).toHaveURL(/category=kids/);
  await expect(page.getByRole("heading", { name: "Kids Shirt" })).toBeVisible();
  await expect(page.getByText("Women Hoodie", { exact: true })).toHaveCount(0);
});

test("camera scanner keeps its video element mounted when permission is granted", async ({ page }) => {
  await mockAdminApi(page);
  await page.addInitScript(() => {
    const stream = document.createElement("canvas").captureStream(1);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => stream },
    });
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: class {
        constructor(_options: { formats: string[] }) {}
        async detect() { return []; }
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => 2 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await page.goto("/admin?section=pos");
  await page.getByRole("button", { name: "Camera scan" }).click();
  await expect(page.getByRole("dialog", { name: "Scan product barcode" })).toBeVisible();
  await expect(page.locator(".barcode-camera-stage video")).toBeAttached();
  await page.getByRole("button", { name: "Allow camera access & start scanning" }).click();
  await expect(page.locator(".barcode-camera-stage video.is-active")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Camera is active");
});

test("camera scanner keeps ZXing fallback available when native barcode detection is broken", async ({ page }) => {
  await mockAdminApi(page);
  await page.addInitScript(() => {
    const stream = document.createElement("canvas").captureStream(1);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => stream },
    });
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: class {
        constructor(_options: { formats: string[] }) { throw new Error("Native barcode detector unavailable"); }
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => 2 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await page.goto("/admin?section=pos");
  await page.getByRole("button", { name: "Camera scan" }).click();
  await page.getByRole("button", { name: "Allow camera access & start scanning" }).click();
  await expect(page.locator(".barcode-camera-stage video.is-active")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Camera is active");
  await page.getByRole("button", { name: "Close scanner" }).click();
  await expect(page.getByRole("dialog", { name: "Scan product barcode" })).toHaveCount(0);
});

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

  const largePng = Buffer.alloc(7 * 1024 * 1024);
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(largePng);
  await page.route("**/api/admin/rentals/" + rentalId + "/documents/**", async route => {
    await route.fulfill({status:200,contentType:"image/png",headers:{"cache-control":"private, no-store"},body:largePng});
  });
  await card.getByRole("button", {name:"Create encrypted backup"}).click();
  await card.getByLabel("New backup password").fill("Test-Backup-Password-2026!");
  await card.getByLabel("Confirm backup password").fill("Test-Backup-Password-2026!");
  const backupDownload = page.waitForEvent("download");
  await card.getByRole("button", {name:"Encrypt & download backup"}).click();
  const backup = await backupDownload;
  expect(backup.suggestedFilename()).toMatch(/DV-R-TEST-0001-cnic-evidence\.dvbackup$/);
  const backupPath = await backup.path();
  expect(backupPath).toBeTruthy();
  const encryptedBackupBytes = await readFile(backupPath!);
  expect(encryptedBackupBytes.length).toBeGreaterThan(24 * 1024 * 1024);
  expect(encryptedBackupBytes.length).toBeLessThan(32 * 1024 * 1024);
  const encryptedEnvelope = JSON.parse(encryptedBackupBytes.toString("utf8")) as Record<string, unknown>;
  expect(encryptedEnvelope).toMatchObject({format:"DEVERVE-CNIC-BACKUP",cipher:"AES-256-GCM",kdf:"PBKDF2-SHA-256"});
  expect(JSON.stringify(encryptedEnvelope)).not.toContain("cnic_front");
  expect(JSON.stringify(encryptedEnvelope)).not.toContain("iVBORw0KGgo");

  const chooserPromise = page.waitForEvent("filechooser");
  await card.getByRole("button", {name:"Decrypt & download"}).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(backupPath!);
  await card.getByLabel("Backup password").fill("Test-Backup-Password-2026!");
  const restoredDownloadPromise = page.waitForEvent("download");
  await card.getByRole("button", {name:"Decrypt & recover files"}).click();
  const restoredDownload = await restoredDownloadPromise;
  await expect(card.getByRole("status")).toContainText("Backup decrypted and integrity-checked");
  expect(restoredDownload.suggestedFilename()).toBe("DV-R-TEST-0001-recovered-evidence.zip");
  const recoveredPath = await restoredDownload.path();
  expect(recoveredPath).toBeTruthy();
  const recoveredZip = await readFile(recoveredPath!);
  expect(recoveredZip.subarray(0,4).toString("hex")).toBe("504b0304");

  const wordPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Word", exact: true }).click();
  const wordDownload = await wordPromise;
  const wordPath = await wordDownload.path();
  expect(wordPath).toBeTruthy();
  const wordBytes = await readFile(wordPath!);
  expect(wordBytes.includes(Buffer.from("word/media/de-verve-logo.png"))).toBe(true);
  expect(wordBytes.includes(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);

  const excelPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "Excel", exact: true }).click();
  const excelDownload = await excelPromise;
  const excelPath = await excelDownload.path();
  expect(excelPath).toBeTruthy();
  const excelBytes = await readFile(excelPath!);
  expect(excelBytes.includes(Buffer.from("xl/media/de-verve-logo.png"))).toBe(true);
  expect(excelBytes.includes(Buffer.from("xl/drawings/drawing1.xml"))).toBe(true);

  const jpgPromise = page.waitForEvent("download");
  await card.getByRole("button", { name: "JPG", exact: true }).click();
  const jpgDownload = await jpgPromise;
  const jpgPath = await jpgDownload.path();
  expect(jpgPath).toBeTruthy();
  const jpgBytes = await readFile(jpgPath!);
  expect(jpgBytes.subarray(0, 2).toString("hex")).toBe("ffd8");
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

test("POS routes a decoded unknown QR payload into product creation with the full value preserved", async ({ page }) => {
  const qrPayload = "https://supplier.example/items/hoodie?id=SKU-2026-0001&colour=navy";
  await mockAdminApi(page);
  await page.addInitScript((payload) => {
    const stream = document.createElement("canvas").captureStream(1);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => stream } });
    Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: class { constructor(_options: { formats: string[] }) {} async detect() { return [{ rawValue: payload }]; } } });
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => 2 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  }, qrPayload);
  await page.goto("/admin?section=pos");
  await page.getByRole("button", { name: "Camera scan" }).click();
  await page.getByRole("button", { name: "Allow camera access & start scanning" }).click();
  await expect(page.getByRole("group", { name: "Unknown scanned product" })).toContainText(qrPayload);
  await page.getByRole("button", { name: "Identify with AI & add product" }).click();
  await expect(page).toHaveURL(/section=ai&barcode=/);
  await expect(page).toHaveURL(url => new URL(url).searchParams.get("barcode") === qrPayload);
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


test("unknown QR payload is prefilled in the new stock variant form", async ({ page }) => {
  const productId = "88888888-8888-4888-8888-888888888888";
  const qrPayload = "https://supplier.example/items/hoodie?id=SKU-2026-0001&colour=navy";
  await mockAdminApi(page);
  await page.route("**/api/admin/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/products" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [{ id: productId, slug: "navy-hoodie", name: "Navy hoodie", description: "Test product", category: "Hoodies", audience: "unisex", status: "draft", retail_price_paisa: 250000, wholesale_price_paisa: null, image_key: null, seo_title: "", seo_description: "" }] }) });
      return;
    }
    if (url.pathname === "/api/admin/products/" + productId + "/variants" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ variants: [] }) });
      return;
    }
    await route.fallback();
  });

  await page.goto("/admin?section=products&barcode=" + encodeURIComponent(qrPayload));
  await expect(page.getByRole("heading", { name: "Product catalogue" })).toBeVisible();
  await page.getByRole("button", { name: "Variants & stock" }).click();
  const editor = page.locator(".admin-variant-editor");
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Barcode")).toHaveValue(qrPayload);
});
test("inventory warns before splitting legacy shared stock or using incomplete variants", async ({ page }) => {
  await mockAdminApi(page, {
    inventory: {
      items: [
        {
          product_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", product_name: "Trouser", category: "Trousers", product_status: "published",
          variant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sku: null, barcode: null,
          size: "S, M, L, XL", color: "Black, Red, Grey, White, Yellow",
          stock_on_hand: 2000, reserved_quantity: 0, reorder_level: 0, available_quantity: 2000,
          variant_active: 1, retail_price_paisa: 1200000, stock_state: "in_stock",
        },
        {
          product_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", product_name: "Tolaza", category: "Trousers", product_status: "published",
          variant_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", sku: "DV-TOLAZA-M", barcode: "2054519750657",
          size: "M", color: "",
          stock_on_hand: 300, reserved_quantity: 0, reorder_level: 0, available_quantity: 300,
          variant_active: 1, retail_price_paisa: 1200000, stock_state: "in_stock",
        },
      ],
      summary: { variants: 2, stock_units: 2300, reserved_units: 0, available_units: 2300, low_stock_variants: 0, out_of_stock_variants: 0 },
    },
  });
  await page.goto("/admin?section=inventory");
  await expect(page.getByRole("heading", { name: "Inventory overview" })).toBeVisible();
  await expect(page.locator(".inventory-data-warning").first()).toContainText("Legacy shared-stock variants need physical reconciliation");
  await expect(page.locator(".inventory-data-warning").first()).toContainText("Trouser");
  await expect(page.locator(".inventory-data-warning-secondary")).toContainText("Variant records need verified details");
  await expect(page.locator(".inventory-data-warning-secondary")).toContainText("Tolaza");
});

test("owner website settings exposes the visual design studio and saves validated design choices", async ({ page }) => {
  await mockAdminApi(page);
  let saved: { site_design?: { hero_title?: string; font_family?: string } } | null = null;
  await page.route("**/api/admin/settings", async route => {
    if (route.request().method() === "PATCH") {
      saved = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated: true }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ settings: { site_design: {
        preset: "midnight-gold", primary_color: "#102d49", accent_color: "#c8a96d",
        surface_color: "#fbfaf7", text_color: "#19324b", corner_radius: 16,
        font_family: "dm-sans", density: "comfortable", button_style: "rounded",
        card_shadow: "soft", hero_title: "Elevate your style.",
        hero_subtitle: "Everyday fashion for men, women and kids.", section_images: {}
      } } })
    });
  });
  await page.goto("/admin?section=overview");
  await page.getByText("Administration", { exact: true }).click();
  await page.getByRole("button", { name: "Website & brand settings" }).click();
  await expect(page.getByRole("heading", { name: "Website visual design studio" })).toBeVisible();
  await page.getByLabel("Homepage headline").fill("A better De VERVE experience");
  await page.getByLabel("Website typography").selectOption("inter");
  await page.getByRole("button", { name: "Save website visual design" }).click();
  await expect(page.locator(".admin-site-design-studio").getByRole("status")).toContainText("Website visual settings saved");
  expect(saved?.site_design?.hero_title).toBe("A better De VERVE experience");
  expect(saved?.site_design?.font_family).toBe("inter");
});

