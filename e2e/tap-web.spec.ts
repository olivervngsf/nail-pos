import { expect, test } from "@playwright/test";

// In a normal browser (not the iPhone app) the page says where to turn it on.
test("Settings → Tap to Pay on iPhone in a browser: how to get to the iPhone app", async ({ page }) => {
  await page.goto("/settings/tap-to-pay");
  await expect(page.getByTestId("tap-not-app")).toContainText("Open this page in the PolishOS iPhone app");
  await expect(page.getByTestId("tap-turn-on")).toHaveCount(0);
});
