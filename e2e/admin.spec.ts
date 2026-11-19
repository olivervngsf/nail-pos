import { expect, test } from "@playwright/test";

// Founder Admin (test copy = sample salons): Home = alerts inbox, Handled hides one; Salons tab = table + filters + add-salon drawer.
test("admin: inbox, handled, salons table, filters, add salon drawer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin");
  await expect(page.getByTestId("inbox-sum")).toContainText("5 things need you today");
  await expect(page.getByTestId("alert")).toHaveCount(5);
  await expect(page.getByTestId("alert").first()).toContainText("Stripe paused payouts");
  await expect(page.getByTestId("today-total")).toContainText("$8,412");
  await expect(page.getByTestId("done-today")).toContainText("Oliver");

  await page.getByTestId("alert").nth(1).getByTestId("handled").click();
  await expect(page.getByTestId("alert")).toHaveCount(4);
  await expect(page.getByTestId("done-today").locator(".row")).toHaveCount(2);

  await page.goto("/admin/salons");
  const rows = page.getByTestId("salon-list").locator("tbody tr");
  await expect(rows).toHaveCount(6);
  // Salon care (design E): no sales in the table; health, last check-in, needs from us, our plan
  await expect(page.getByTestId("tile-ok")).toContainText("1 of 6");
  await expect(page.getByTestId("tile-checkin")).toContainText("Lotus Nails");
  await expect(page.getByTestId("tile-paid")).toContainText("1 of 2");
  await expect(page.getByTestId("tile-pilot")).toContainText("Lotus Nails · 10 days left");
  await expect(page.getByTestId("salon-list")).not.toContainText("$3,410");
  const kim = rows.filter({ hasText: "Kim’s Nails" });
  await expect(kim.getByTestId("checkin")).toContainText("Needs help");
  await expect(kim.getByTestId("checkin")).toContainText("9 days ago · Elang");
  await expect(kim.getByTestId("need")).toContainText("Overdue 2 days");
  await expect(rows.filter({ hasText: "Cosmo Nails" }).getByTestId("use")).toHaveText("Busy week");
  // devices on / off: one check mark per device that is on, an empty ring for each one that is off
  await expect(rows.filter({ hasText: "Cosmo Nails" }).getByTestId("devices")).toContainText("4 of 4 on");
  await expect(rows.filter({ hasText: "Cosmo Nails" }).getByTestId("devices").locator(".dv-mark.is-on")).toHaveCount(4);
  await expect(rows.filter({ hasText: "Lotus Nails" }).getByTestId("devices").locator(".dv-mark.is-off")).toHaveCount(3);
  await expect(rows.filter({ hasText: "Nails by Vy" }).getByTestId("devices")).toContainText("No devices");
  await expect(rows.filter({ hasText: "Happy Nails" }).getByTestId("plan")).toHaveText("Payment late");
  await page.getByTestId("f-checkin").click();
  await expect(rows).toHaveCount(1);
  await page.getByTestId("f-late").click();
  await expect(rows).toHaveCount(1);
  await page.getByTestId("f-action").click();
  await expect(rows).toHaveCount(5);
  await page.getByTestId("f-all").click();

  // 3 dots → log a check-in (test version keeps it on the screen)
  await kim.getByTestId("row-menu").click();
  await expect(page.getByRole("menu")).toContainText("Archive salon");
  await page.getByTestId("m-checkin").click();
  await page.getByTestId("checkin-save").click();
  await expect(page.getByTestId("checkin-form").getByRole("alert")).toContainText("Pick how it was");
  await page.getByTestId("checkin-form").getByRole("button", { name: "Happy" }).click();
  await page.getByLabel("What did we see or hear?").fill("Printer works now.");
  await page.getByLabel("What do they need from us?").fill("Send the gift card guide");
  await page.getByTestId("checkin-save").click();
  await expect(kim.getByTestId("checkin")).toContainText("Printer works now.");
  await expect(kim.getByTestId("checkin")).toContainText("Today · Elang");
  await expect(kim.getByTestId("need")).toContainText("Send the gift card guide");

  // 3 dots → edit details (owner joined = owner fields are theirs), archive asks for the name
  await kim.getByTestId("row-menu").click();
  await page.getByTestId("m-edit").click();
  await expect(page.getByTestId("edit-form")).toContainText("theirs to change");
  await page.keyboard.press("Escape");
  await kim.getByTestId("row-menu").click();
  await page.getByTestId("m-archive").click();
  await expect(page.getByTestId("archive-go")).toBeDisabled();
  await page.getByLabel(/Type the salon name/).fill("Kim’s Nails");
  await expect(page.getByTestId("archive-go")).toBeEnabled();
  await page.keyboard.press("Escape");

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
  await expect(page.getByTestId("h-texting").getByRole("button", { name: "Approved" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("salon-alert")).toHaveCount(2);
  await page.getByTestId("salon-alert").first().getByRole("button", { name: "Handled" }).click();
  await expect(page.getByTestId("salon-alert")).toHaveCount(1);

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
