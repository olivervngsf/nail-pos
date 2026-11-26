import { expect, test } from "@playwright/test";

// Settings → Timesheet (test copy: sample week). Day + week views, the missing clock-out banner, fix with a reason.
test("timesheet: today, week, fix a missing clock-out", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/timesheet");
  const day = page.getByTestId("ts-day");
  await expect(day).toContainText("Bao Tran");
  await expect(day).toContainText("Linh Pham");
  await expect(day).toContainText("Clock-in refused");
  const wide = (page.viewportSize()?.width ?? 999) >= 600;
  // Tuan forgot to clock out yesterday (only when today isn't the first day of the week).
  const banner = page.getByTestId("ts-needfix");
  if (await banner.count()) {
    await banner.getByRole("button", { name: "Fix time" }).click();
    await page.getByTestId("ts-time").selectOption("18:30");
    await page.getByRole("button", { name: "Forgot" }).click();
    await page.getByTestId("ts-save-fix").click();
    await expect(page.getByTestId("ts-needfix")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Week" }).click();
  const week = page.getByTestId("ts-week");
  await expect(week).toContainText("Hanh Le");
  if (wide) {
    const dl = page.waitForEvent("download");
    await page.getByTestId("ts-csv").click();
    expect((await dl).suggestedFilename()).toMatch(/^timesheet-/);
  }
  await week.getByText("Kim Vo").click();
  await expect(page.getByRole("dialog", { name: "Kim Vo" })).toContainText("Fix");
  expect(errors).toEqual([]);
});
