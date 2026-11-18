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
