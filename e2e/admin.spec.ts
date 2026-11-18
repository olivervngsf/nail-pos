import { expect, test } from "@playwright/test";

// Founder Admin (test copy = sample salons): Home = alerts inbox, Handled hides one; Salons tab = table + filters + add-salon drawer.
test("admin: inbox, handled, salons table, filters, add salon drawer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin");
  await expect(page.getByTestId("inbox-sum")).toContainText("3 things need you today");
  await expect(page.getByTestId("alert")).toHaveCount(3);
  await expect(page.getByTestId("alert").first()).toContainText("Stripe paused payouts");
  await expect(page.getByTestId("today-total")).toContainText("$8,412");
  await expect(page.getByTestId("done-today")).toContainText("Oliver");

  await page.getByTestId("alert").nth(1).getByTestId("handled").click();
  await expect(page.getByTestId("alert")).toHaveCount(2);
  await expect(page.getByTestId("done-today").locator(".row")).toHaveCount(2);

  await page.goto("/admin/salons");
  const rows = page.getByTestId("salon-list").locator("tbody tr");
  await expect(rows).toHaveCount(6);
  await page.getByTestId("f-action").click();
  await expect(rows).toHaveCount(4);
  await page.getByTestId("f-setup").click();
  await expect(rows).toHaveCount(2);

  await page.getByTestId("add-salon-open").click();
  await page.getByLabel("Salon name").fill("Rose Nails");
  await page.getByTestId("add-salon-go").click();
  await expect(page.getByTestId("add-salon").getByRole("alert")).toContainText("owner name are needed");
  expect(errors).toEqual([]);
});
