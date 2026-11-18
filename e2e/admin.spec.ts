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

// Salon page (board A2 + A8): totals, health rows, open alerts + Handled, activity filters, call note.
test("admin: salon page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin/salons");
  await page.getByTestId("salon-link").filter({ hasText: "Happy Nails" }).click();
  await expect(page.getByTestId("salon-name")).toHaveText("Happy Nails");
  await expect(page.getByTestId("salon-health")).toHaveText("Problem");
  await expect(page.getByTestId("salon-today")).toContainText("$1,550");
  await expect(page.getByTestId("h-stripe")).toContainText("Payouts paused");
  await expect(page.getByTestId("salon-alert")).toHaveCount(1);
  await page.getByTestId("salon-alert").getByRole("button", { name: "Handled" }).click();
  await expect(page.getByTestId("salon-alert")).toHaveCount(0);

  const rows = page.getByTestId("activity").locator(".row.m");
  await expect(rows).toHaveCount(9);
  await page.getByTestId("act-money").click();
  await expect(rows).toHaveCount(2);
  await page.getByTestId("act-all").click();

  await page.getByLabel("Call note").fill("Owner sends the bank paper tonight.");
  await page.getByTestId("note-save").click();
  await expect(rows.first()).toContainText("Owner sends the bank paper tonight.");
  expect(errors).toEqual([]);
});
