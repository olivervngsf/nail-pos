import { expect, test } from "@playwright/test";

// Top bar · one rule (board "Top Bar · One Rule", Nov 26): page name (+ one fact) in the bar, never a second big
// title under it; on computers / iPads the ONE main button is the bar's last item, far right.
const SCREENS = [
  { path: "/checkout", title: "Checkout", action: "new-ticket" },
  { path: "/clients", title: "Clients", action: "client-new" },
  { path: "/close-day", title: "Close day", action: null },
];

for (const s of SCREENS) {
  test(`top bar on ${s.path}`, async ({ page }) => {
    await page.goto(s.path);
    const bar = page.locator("header.bar");
    await expect(bar.getByTestId("bar-title")).toContainText(s.title);
    await expect(page.locator("main h1")).toHaveCount(0);
    const wide = (page.viewportSize()?.width ?? 0) >= 600;
    if (s.action && wide) {
      const btn = bar.getByTestId(s.action);
      await expect(btn).toBeVisible();
      await expect(bar.locator(":scope > :last-child")).toHaveAttribute("data-testid", s.action);
    }
  });
}

test("checkout: scan box sits in the top bar on computers, on the page on phones", async ({ page }) => {
  await page.goto("/checkout");
  const wide = (page.viewportSize()?.width ?? 0) >= 600;
  await expect(page.getByTestId("scan-box")).toHaveCount(1);
  await expect(page.locator("header.bar").getByTestId("scan-box")).toHaveCount(wide ? 1 : 0);
});
