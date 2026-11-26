import { expect, test } from "@playwright/test";

// Settings → Salon info & hours + Service menu (test copy: sample salon, changes stay on screen).
test("salon info: change name + address + a day's hours, then save", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/salon");
  await expect(page.getByTestId("si-save")).toBeDisabled();
  await page.getByTestId("si-name").fill("Lotus Nails & Spa");
  await page.getByTestId("address-input").fill("9 Oak St, San Jose, CA 95112");
  await page.getByTestId("si-day-6").getByRole("switch").click();
  await expect(page.getByTestId("si-day-6")).toContainText("Closed");
  await page.getByTestId("si-save").click();
  await expect(page.getByText("Saved").last()).toBeVisible();
  await expect(page.getByTestId("si-save")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("service menu: change a price, add a service, remove it", async ({ page }) => {
  await page.goto("/settings/menu");
  await page.getByTestId("menu-row").first().click();
  await page.getByTestId("ms-price").fill("42");
  await page.getByTestId("menu-save").click();
  await expect(page.getByTestId("menu-row").first()).toContainText("$42");
  await page.getByTestId("menu-add").click();
  await page.getByTestId("ms-name").fill("Jelly spa");
  await page.getByTestId("ms-price").fill("35");
  await page.getByTestId("menu-save").click();
  const row = page.getByTestId("menu-row").filter({ hasText: "Jelly spa" });
  await expect(row).toBeVisible();
  await row.click();
  await page.getByTestId("menu-remove").click();
  await page.getByTestId("menu-remove-yes").click();
  await expect(row).toHaveCount(0);
});

test("settings: week starts on Sunday → hours, calendar and date pickers follow; back to Monday", async ({ page }) => {
  await page.goto("/settings/salon");
  const wk = page.getByTestId("week-start");
  await expect(wk.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".si-hours .si-day").nth(1)).toContainText("Mon");
  await wk.getByRole("button", { name: "Sunday" }).click();
  await expect(page.locator(".si-hours .si-day").nth(1)).toContainText("Sun");
  await page.getByTestId("si-save").click();
  await expect(page.getByTestId("si-save")).toBeDisabled();
  await page.goto("/calendar?view=month");
  await expect(page.locator(".cal-mh").first()).toHaveText("Sun");
  await page.goto("/payouts");
  await page.getByTestId("po-range").click();
  await expect(page.locator(".dp-pop .dp-wd").first()).toHaveText("S");
  await expect(page.locator(".dp-pop .dp-wd").nth(1)).toHaveText("M");
  await page.keyboard.press("Escape");
  await page.goto("/settings/salon");
  await page.getByTestId("week-start").getByRole("button", { name: "Monday" }).click();
  await page.getByTestId("si-save").click();
  await page.goto("/calendar?view=month");
  await expect(page.locator(".cal-mh").first()).toHaveText("Mon");
});
