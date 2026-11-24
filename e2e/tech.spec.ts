import { expect, test } from "@playwright/test";

test("tech app: home, my schedule (day, week, details), earnings, me (language) with bottom tabs", async ({ page }) => {
  await page.goto("/t");
  await expect(page.getByText("Hi Kim")).toBeVisible();
  await expect(page.getByTestId("today-total")).toContainText("$");
  await page.getByTestId("clock").click();
  await expect(page.getByTestId("clock-state")).toContainText("Out at");

  await page.getByTestId("tab-schedule").click();
  await expect(page).toHaveURL(/\/t\/schedule/);
  const appts = page.getByTestId("my-appt");
  await expect(appts.first()).toBeVisible();
  // Today's list has the red now line (sample day = today) and the swipe hint.
  await expect(page.getByTestId("now-line")).toHaveCount(1);
  await expect(page.getByTestId("day-title")).toContainText("Today");
  // Next day and back (same as a swipe), then the list is today again.
  await page.getByRole("button", { name: "After", exact: true }).click();
  await expect(page.getByTestId("day-title")).not.toContainText("Today");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByTestId("day-title")).toContainText("Today");
  await appts.first().click();
  await expect(page.getByTestId("appt-detail")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).last().click();
  await page.getByRole("button", { name: "Week" }).click();
  await expect(page.getByTestId("my-week")).toBeVisible();

  await page.getByTestId("tab-earnings").click();
  await expect(page.getByTestId("slip-total")).toContainText("$");
  await expect(page.getByTestId("tech-print")).toBeVisible();

  await page.getByTestId("tab-me").click();
  await page.getByRole("button", { name: "Tiếng Việt" }).click();
  await expect(page.getByTestId("tab-home")).toContainText("Trang chủ");
  await page.getByRole("button", { name: "English" }).click();

  await page.getByTestId("tab-book").click();
  await expect(page).toHaveURL(/\/t\/book/);
});
