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

test("switches slide one pill to the picked option", async ({ page }) => {
  await page.goto("/kit");
  const seg = page.getByRole("group", { name: "View" });
  const pill = seg.locator(".seg-pill");
  await expect(pill).toHaveCount(1);
  await expect(seg).toHaveClass(/pilled/);
  const spot = async () => (await pill.boundingBox())!;
  const on = async () => (await seg.locator(".on").boundingBox())!;
  await expect.poll(async () => Math.abs((await spot()).x - (await on()).x)).toBeLessThan(1.5);
  await seg.getByRole("button", { name: "Month" }).click();
  await expect.poll(async () => Math.abs((await spot()).x - (await on()).x), { timeout: 2000 }).toBeLessThan(1.5);
  await expect.poll(async () => Math.abs((await spot()).width - (await on()).width)).toBeLessThan(1.5);
});

test("checkout steps slide forward, and back on Back", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  await page.getByTestId("add-service").click();
  await page.getByLabel("Search services").fill("gel color man");
  await page.getByRole("button", { name: /Gel color manicure/ }).click();
  await page.getByTestId("pick-Kim").click();
  const col = page.locator(".tk-app > .col");
  await page.getByTestId("charge").click();
  await expect(col).toHaveAttribute("data-dir", "fwd");
  await page.getByRole("button", { name: "‹ Back" }).click();
  await expect(col).toHaveAttribute("data-dir", "back");
  await expect(page.getByTestId("charge")).toBeVisible();
});
