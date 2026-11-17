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
