import { expect, test } from "@playwright/test";

// Settings → Salon address: card payments need street, city, state and ZIP (Stripe location).
test("Settings → Salon address: shows what's missing, saves only a full address", async ({ page }) => {
  await page.goto("/settings/salon");
  const input = page.getByTestId("address-input");
  await input.fill("1550 S Bascom Ave, Campbell");
  await expect(page.getByTestId("address-check")).toContainText("Missing: ZIP");
  await expect(page.getByTestId("address-save")).toBeDisabled();
  await input.fill("1550 S Bascom Ave, Campbell, CA 95008");
  await expect(page.getByTestId("address-check")).toContainText("Ready for card payments");
  await expect(page.getByTestId("address-parts")).toContainText("95008");
  await expect(page.getByTestId("address-save")).toBeDisabled(); // nothing changed from what's saved
  await input.fill("200 Main St, San Jose, CA 95112");
  await page.getByTestId("address-save").click();
  await expect(page.getByTestId("address-saved")).toContainText("Saved");
});

test("Settings menu: grouped by job", async ({ page }) => {
  await page.goto("/settings/salon");
  const nav = page.locator(".set-nav");
  for (const g of ["Salon", "Team & time clock", "Taking payments", "Clients & booking", "Pay the team"]) await expect(nav.getByText(g, { exact: true })).toBeAttached();
});
