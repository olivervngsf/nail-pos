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

test("a new ticket line grows in and the total settles", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  const add = async (q: RegExp, search: string) => {
    await page.getByTestId("add-service").click();
    await page.getByLabel("Search services").fill(search);
    await page.getByRole("button", { name: q }).first().click();
    await page.getByTestId("pick-Kim").click();
  };
  await add(/Gel color manicure/, "gel color man");
  // record animations started on lines + the total
  await page.evaluate(() => {
    (window as unknown as { seen: string[] }).seen = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...a: Parameters<Element["animate"]>) {
      const el = this as HTMLElement;
      (window as unknown as { seen: string[] }).seen.push(el.dataset.testid ?? (el.classList.contains("lv") ? "ghost" : el.className));
      return orig.apply(this, a);
    };
  });
  await add(/Pedicure/, "pedicure");
  await expect(page.getByTestId("line")).toHaveCount(2);
  const seen = () => page.evaluate(() => (window as unknown as { seen: string[] }).seen);
  await expect.poll(seen).toContain("line"); // the new line grew in
  await expect.poll(seen).toContain("due"); // the total settled to its new value
});

test("waiting screens show soft shapes, not a blank page", async ({ page }) => {
  await page.goto("/kit");
  await page.evaluate(() => { const d = document.createElement("div"); d.setAttribute("aria-busy", "true"); d.id = "wait"; document.body.prepend(d); });
  const before = await page.locator("#wait").evaluate((el) => getComputedStyle(el, "::before").content);
  expect(before).toBe('""');
  expect(await page.locator("#wait").evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(112);
});

test("a PIN message shakes the dots every time, even when it repeats", async ({ page }) => {
  // the kit keypad answers every PIN with a message: the same message twice must still shake twice
  await page.goto("/kit");
  const pad = page.locator(".dots").first().locator("..");
  const tap = async (digits: string) => { for (const d of digits) await pad.getByRole("button", { name: d, exact: true }).click(); };
  const pinLen = await page.locator(".dots").first().locator("i").count();
  const wrong = "1234".padEnd(pinLen, "1234");
  await tap(wrong);
  await expect(page.locator(".dots").first()).toHaveAttribute("data-shake", "1");
  await tap(wrong);
  await expect(page.locator(".dots").first()).toHaveAttribute("data-shake", "2", { timeout: 2000 });
});
