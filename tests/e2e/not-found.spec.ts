import { test, expect } from "@playwright/test";

test("unknown URLs show a branded, non-indexable not-found page", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to De VERVE" })).toHaveAttribute("href", "/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page).toHaveTitle("Page not found | De VERVE");
});
