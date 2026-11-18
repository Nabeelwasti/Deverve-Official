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
});
