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
