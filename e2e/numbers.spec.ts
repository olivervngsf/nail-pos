import { expect, test } from "@playwright/test";

// Owner Numbers (test copy = sample salon): 5 KPIs vs before, chart + fact, more numbers, per-staff table, CSV export.
test("owner numbers: periods, KPIs, fact line, staff table, export", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/numbers");
  await expect(page.getByTestId("kpi-sales")).toContainText("$");
  await expect(page.getByTestId("nm-fact")).not.toBeEmpty();
  await expect(page.getByTestId("nm-staff").locator("tbody tr")).toHaveCount(3);

  await page.getByText("Walk-in wait").click();
  await expect(page.getByTestId("nm-fact")).toContainText("walk-outs");
  await page.getByText("Came back").click();
  await expect(page.getByTestId("nm-fact")).toContainText("Jen Park");

  await page.getByTestId("per-month").click();
  await expect(page.getByTestId("nm-staff")).toContainText("Staff · this month");
  await page.getByTestId("per-day").click();
  await expect(page.getByTestId("kpi-sales")).toBeVisible();

  const dl = page.waitForEvent("download");
  await page.getByTestId("nm-export").click();
  const file = await dl;
  expect(file.suggestedFilename()).toContain("numbers-day.csv");
  expect(errors).toEqual([]);
});
