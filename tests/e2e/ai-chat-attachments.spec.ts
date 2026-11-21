import { test, expect } from "@playwright/test";

test("customer AI chat uploads a text attachment and includes extracted text in the request", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/storefront/settings", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ brand_assets: {} }),
  }));
  await page.route("**/api/ai/chat", async route => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ reply: "I read the attached notes." }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  const chat = page.getByRole("dialog", { name: "De VERVE AI customer support" });
  await chat.getByRole("button", { name: "Add attachment" }).click();
  await chat.getByRole("menuitem", { name: "Attach any file" }).click();
  await chat.locator('input[type="file"]').nth(2).setInputFiles({
    name: "product-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Sizes: S, M, L. Colours: navy and black.", "utf8"),
  });
  await expect(chat.getByText("product-notes.txt")).toBeVisible();
  await chat.getByRole("button", { name: "Send message" }).click();

  await expect(chat.getByText("I read the attached notes.")).toBeVisible();
  const attachments = submitted?.attachments as Array<Record<string, unknown>>;
  expect(attachments).toHaveLength(1);
  expect(attachments[0]).toMatchObject({
    name: "product-notes.txt",
    mime_type: "text/plain",
    text: "Sizes: S, M, L. Colours: navy and black.",
  });
  expect(attachments[0]).not.toHaveProperty("data");
});

test("customer AI chat rejects unsupported legacy binary documents with clear guidance", async ({ page }) => {
  await page.route("**/api/storefront/settings", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ brand_assets: {} }),
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Open De VERVE AI chat" }).click();
  const chat = page.getByRole("dialog", { name: "De VERVE AI customer support" });
  await chat.getByRole("button", { name: "Add attachment" }).click();
  await chat.getByRole("menuitem", { name: "Attach any file" }).click();
  await chat.locator('input[type="file"]').nth(2).setInputFiles({
    name: "legacy-document.doc",
    mimeType: "application/msword",
    buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  });
  await expect(chat.getByRole("status")).toContainText(/cannot be interpreted directly|Export it as PDF/i);
  await expect(chat.getByText("legacy-document.doc")).toHaveCount(0);
});
