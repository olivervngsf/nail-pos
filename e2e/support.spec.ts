import { expect, test } from "@playwright/test";

// Settings → Support (test copy): the owner turns support on for 24 hours (with a reason), sees time left and the log,
// then ends it. Off by default.
test("owner turns support on for 24h, sees it logged, ends it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/support");
  const box = page.getByTestId("support-page");
  await expect(box).toContainText("Off");
  await expect(page.getByTestId("support-log")).toContainText("Nothing yet.");

  await page.getByLabel("What do you need help with? (optional)").fill("Card reader");
  await page.getByTestId("support-on-btn").click();
  await expect(page.getByTestId("support-on")).toContainText(/Support is on · 2[34]h \d+ min left/);
  await expect(page.getByTestId("support-on")).toContainText("Card reader");
  await expect(page.getByTestId("support-log")).toContainText("Support turned on");

  await page.getByTestId("support-end").click();
  await expect(page.getByTestId("support-on")).toHaveCount(0);
  await expect(page.getByTestId("support-log")).toContainText("Support ended");
  await expect(page.getByTestId("support-on-btn")).toBeVisible();
  expect(errors).toEqual([]);
});
