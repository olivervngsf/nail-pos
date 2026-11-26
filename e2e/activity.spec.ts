import { expect, test } from "@playwright/test";

// Settings → Activity log (test copy = sample day): filter by kind and person, open a row, export CSV.
test("activity log: filter, details, export", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/activity");
  const log = page.getByTestId("act-log");
  await expect(log).toContainText("Refund");
  await expect(log).toContainText("Clocked in");
  await expect(page.getByTestId("nav-activity")).toHaveAttribute("aria-current", "page");

  await page.getByTestId("act-kind-clock").click();
  await expect(log).not.toContainText("Refund");
  await expect(log).toContainText("Clock-in refused");

  await page.getByTestId("act-kind-all").click();
  await page.getByTestId("act-person").selectOption("Kim Vo");
  await expect(page.getByTestId("act-row")).toHaveCount(2);

  await page.getByTestId("act-person").selectOption("");
  await page.getByTestId("act-row").first().click();
  await expect(page.getByTestId("act-detail")).toContainText("Bao Tran");
  await expect(page.getByTestId("act-detail")).toContainText("#1291");
  await page.keyboard.press("Escape");

  const download = page.waitForEvent("download");
  await page.getByTestId("act-csv").click();
  expect((await download).suggestedFilename()).toMatch(/^activity-.*\.csv$/);
  expect(errors).toEqual([]);
});
