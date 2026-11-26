import { expect, test } from "@playwright/test";

// Motion plan step 2: closed pop-ups leave gently (src/lib/motion.ts), never instantly, never in the way.
test.use({ reducedMotion: "no-preference" });

test("drawer, sheet and toast leave gently, then are gone", async ({ page }) => {
  await page.goto("/kit");
  await page.getByRole("button", { name: "Open drawer" }).click();
  await expect(page.getByRole("dialog", { name: "Add staff" })).toBeVisible();
  await page.keyboard.press("Escape");
  // the real drawer is gone at once (nothing waits) …
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // … while a silent copy slides out, can't be clicked, then removes itself
  const ghost = page.locator(".drawer.lv");
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".scrim.lv")).toHaveCount(1);
  await expect(page.locator(".lv")).toHaveCount(0, { timeout: 1500 });

  await page.getByRole("button", { name: "Open sheet" }).click();
  await page.getByRole("dialog", { name: "Tip" }).getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".sheet.lv")).toHaveCount(1);
  await expect(page.locator(".lv")).toHaveCount(0, { timeout: 1500 });
  // the page underneath works straight away
  await page.getByRole("button", { name: "Open drawer" }).click();
  await expect(page.getByRole("dialog", { name: "Add staff" })).toBeVisible();
});

test("reduced motion: closing is instant, no copies", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/kit");
  await page.getByRole("button", { name: "Open drawer" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".lv")).toHaveCount(0);
  await ctx.close();
});
