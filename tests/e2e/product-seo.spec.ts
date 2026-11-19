import { test, expect } from "@playwright/test";

const productId = "11111111-1111-4111-8111-111111111111";

test("product detail publishes product-specific metadata and structured data", async ({ page }) => {
  await page.route((url) => url.pathname === "/api/products" && url.searchParams.get("slug") === "seo-test-product", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [{
          id: productId,
          slug: "seo-test-product",
          name: "Everyday Cotton Hoodie",
          description: "A comfortable everyday cotton hoodie.",
          category: "Hoodies",
          audience: "unisex",
          retail_price_paisa: 249900,
          image_key: null,
          seo_title: "Everyday Cotton Hoodie | De VERVE",
          seo_description: "Shop an everyday cotton hoodie from De VERVE in Jhelum, Pakistan.",
          variants: [],
          media: [{
            id: "22222222-2222-4222-8222-222222222222",
            media_type: "image",
            mime_type: "image/jpeg",
            alt_text: "Navy everyday cotton hoodie",
            caption: "",
            is_primary: 1,
            url: "/media/22222222-2222-4222-8222-222222222222"
          }]
        }]
      })
    });
  });

  await page.route((url) => url.pathname === `/api/products/${productId}/reviews`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reviews: [], average_rating: null, rating_count: 0, authenticated: false, eligible_order_items: [] })
    });
  });

  await page.goto("/product/seo-test-product");
  await expect(page).toHaveTitle("Everyday Cotton Hoodie | De VERVE");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Shop an everyday cotton hoodie from De VERVE in Jhelum, Pakistan.");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "product");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://127.0.0.1:4173/product/seo-test-product");
  const jsonLdText = await page.locator("#deverve-product-jsonld").textContent();
  expect(JSON.parse(jsonLdText ?? "{}")).toMatchObject({
    "@type": "Product",
    name: "Everyday Cotton Hoodie",
    offers: { price: "2499.00", priceCurrency: "PKR" }
  });
});

test("adding a colour-specific product stores the matching image in the shopping cart", async ({ page }) => {
  const mediaId = "33333333-3333-4333-8333-333333333333";
  await page.route((url) => url.pathname === "/api/products" && url.searchParams.get("slug") === "colour-cart-test", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [{
          id: productId,
          slug: "colour-cart-test",
          name: "Colour Cart Test Hoodie",
          description: "A test garment with colour-specific photos.",
          category: "Hoodies",
          audience: "unisex",
          retail_price_paisa: 249900,
          image_key: null,
          seo_title: "",
          seo_description: "",
          variants: [
            { id: "44444444-4444-4444-8444-444444444444", sku: "DV-NAVY-M", size: "M", color: "Navy", available_quantity: 5 },
            { id: "55555555-5555-4555-8555-555555555555", sku: "DV-BLACK-M", size: "M", color: "Black", available_quantity: 4 }
          ],
          media: [
            { id: "66666666-6666-4666-8666-666666666666", media_type: "image", mime_type: "image/jpeg", alt_text: "Navy hoodie", caption: "", is_primary: 1, color: "Navy", url: "/media/navy-hoodie" },
            { id: mediaId, media_type: "image", mime_type: "image/jpeg", alt_text: "Black hoodie", caption: "", is_primary: 0, color: "Black", url: "/media/black-hoodie" }
          ]
        }]
      })
    });
  });
  await page.route((url) => url.pathname === `/api/products/${productId}/reviews`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reviews: [], average_rating: null, rating_count: 0, authenticated: false, eligible_order_items: [] }) });
  });

  await page.goto("/product/colour-cart-test");
  await page.getByRole("button", { name: "Colour Black" }).click();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("deverve-cart") || "[]"));
  expect(cart).toHaveLength(1);
  expect(cart[0]).toMatchObject({ color: "Black", size: "M", image_url: "/media/black-hoodie" });
});

