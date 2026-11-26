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


// Nov 26 (like Claude): tap your profile → pop-up → Settings opens as a window with the menu beside the page
// (computer), or as a list → page (phone / upright tablet: ‹ back, search on the list); X goes back to where you were.
test("profile pop-up opens Settings as a window; search + close", async ({ page }, info) => {
  await page.goto("/checkout");
  if (info.project.name === "desktop") {
    await page.getByTestId("account-menu").click();
    await expect(page.getByTestId("account-pop")).toContainText("Activity log");
    await page.getByTestId("go-activity").click();
    await expect(page).toHaveURL(/\/settings\/activity/);
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await expect(page.getByTestId("nav-activity")).toBeVisible();
    await page.getByTestId("settings-search").fill("print");
    await expect(page.getByTestId("nav-printer")).toBeVisible();
    await expect(page.getByTestId("nav-team")).toHaveCount(0);
    await page.getByTestId("settings-close").click();
    await expect(page).toHaveURL(/\/checkout/);
    return;
  }
  // phones: Settings = a list; a row opens its page; ‹ goes back to the list; X closes
  await page.goto("/settings");
  await expect(page.getByTestId("settings-list")).toBeVisible();
  await expect(page.getByTestId("settings-account")).toBeVisible();
  // "Safety + records" opens its short list, then Activity log (board: 13 rows, Running the salon rows open a list)
  await page.getByTestId("row-safety").click();
  await expect(page).toHaveURL(/\/settings\/more\/safety$/);
  await page.getByTestId("row-activity").click();
  await expect(page).toHaveURL(/\/settings\/activity/);
  await page.getByTestId("bar-back").click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByTestId("settings-search").fill("print");
  await expect(page.getByTestId("row-printer")).toBeVisible();
  await expect(page.getByTestId("row-team")).toHaveCount(0);
  await page.getByTestId("settings-close").click();
  await expect(page).toHaveURL(/\/today/);
});
