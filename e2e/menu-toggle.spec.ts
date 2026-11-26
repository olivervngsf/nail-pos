import { expect, test } from "@playwright/test";

// Top bar sidebar button hides / shows the left menu; remembered on this device. Phones keep the bottom tab bar.
test("sidebar button hides and shows the left menu", async ({ page }) => {
  await page.goto("/clients");
  const tg = page.getByTestId("menu-toggle");
  const rail = page.locator(".app > .rail");
  if ((page.viewportSize()?.width ?? 0) < 600) { await expect(tg).toBeHidden(); return; }
  await expect(tg).toBeVisible();
  await expect(rail).toBeVisible();
  await tg.click();
  await expect(rail).toBeHidden();
  await page.goto("/calendar");
  await expect(page.locator(".app > .rail")).toBeHidden();
  await page.getByTestId("menu-toggle").click();
  await expect(page.locator(".app > .rail")).toBeVisible();
});
