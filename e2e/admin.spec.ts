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
  // no sales per salon on Home: a word instead
  await expect(page.getByTestId("home-use").filter({ hasText: "Busy week" })).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "All salons today" })).not.toContainText("$3,410");
  await expect(page.getByTestId("done-today")).toContainText("Oliver");

  await page.getByTestId("alert").nth(1).getByTestId("handled").click();
  await expect(page.getByTestId("alert")).toHaveCount(4);
  await expect(page.getByTestId("done-today").locator(".row")).toHaveCount(2);

  await page.goto("/admin/salons");
  // Health table (Oliver Nov 20): one row per salon, worst first; one word + icon per check; a card per check on top.
  const rows = page.getByTestId("salon-row");
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toHaveAttribute("data-tone", "bad");
  await expect(page.getByTestId("card-stripe")).toContainText("3 off");
  const bella = rows.filter({ hasText: "Bella Nails" });
  await expect(bella.getByTestId("c-stripe")).toContainText("Quiet 3h");
  await expect(bella.getByTestId("c-speed")).toContainText("3.8s");
  await expect(bella.getByTestId("c-stripe")).toHaveAttribute("href", /\?tab=stripe$/);
  await expect(rows.filter({ hasText: "Cosmo Nails" }).getByTestId("c-devices")).toContainText("4 of 4");
  await expect(rows.filter({ hasText: "Lotus Nails" }).getByTestId("c-devices")).toContainText("0 of 3");
  await expect(rows.filter({ hasText: "Happy Nails" }).getByTestId("c-bills")).toContainText("Late");
  await expect(page.getByTestId("salon-list")).not.toContainText("$3,410");
  const kim = rows.filter({ hasText: "Kim’s Nails" });
  await expect(kim.getByTestId("c-talks")).toContainText("9 days");
  await expect(kim.getByTestId("need")).toContainText("Overdue 2 days");
  await page.getByTestId("f-bad").click();
  await expect(rows).toHaveCount(4);
  await page.getByTestId("f-watch").click();
  await expect(rows).toHaveCount(1);
  await page.getByTestId("f-good").click();
  await expect(rows).toHaveCount(1);
  await page.getByTestId("card-speed").click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Bella Nails");
  await page.getByTestId("f-all").click();
  await expect(rows).toHaveCount(6);

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
  await expect(kim.getByTestId("c-talks")).toContainText("Today");
  await expect(kim.getByTestId("c-talks")).toHaveAttribute("title", /Printer works now\./);
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
  await expect(page.getByTestId("salon-health")).toHaveText("Needs us now");
  await expect(page.getByTestId("salon-today")).toContainText("$1,550");
  await expect(page.getByTestId("h-stripe")).toContainText("Payouts paused");
  await expect(page.getByTestId("salon-alert")).toHaveCount(2);
  await page.getByTestId("salon-alert").first().getByRole("button", { name: "Handled" }).click();
  await expect(page.getByTestId("salon-alert")).toHaveCount(1);
  await page.getByLabel("Call note").fill("Owner sends the bank paper tonight.");
  await page.getByTestId("note-save").click();

  // One tab per check; a check on the overview opens its tab.
  await page.getByTestId("h-stripe").click();
  await expect(page).toHaveURL(/tab=stripe/);
  await expect(page.getByTestId("tab-body-stripe")).toContainText("Card payment");
  await page.getByTestId("tab-texting").click();
  await expect(page.getByTestId("h-texting").getByRole("button", { name: "Approved" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("tab-speed").click();
  await expect(page.getByTestId("tab-body-speed")).toContainText("Page load");
  await page.getByTestId("tab-activity").click();
  const act = page.getByTestId("activity").locator(".row.m");
  await expect(act).toHaveCount(10);
  await expect(act.first()).toContainText("Owner sends the bank paper tonight.");
  await page.getByTestId("act-money").click();
  await expect(act).toHaveCount(2);

  // Straight from the table to a tab
  await page.goto("/admin/salons");
  await page.getByTestId("salon-row").filter({ hasText: "Bella Nails" }).getByTestId("c-texting").click();
  await expect(page.getByTestId("tab-body-texting")).toContainText("Texting");
  expect(errors).toEqual([]);
});
