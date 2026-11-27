import { expect, test } from "@playwright/test";

// Booking page (test copy, slug "demo"): the salon logo + name and "See our photos, services + team"
// always lead back to the salon's home (photos, services, techs), mid-booking and after booking.
test("salon logo + name go back home; booked screen links to the salon", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByTestId("book-me")).toBeVisible();
  await expect(page.getByTestId("bw-home")).toHaveCount(0); // already home: plain logo

  await page.getByTestId("book-me").click();
  await page.getByTestId("svc").first().click();
  await page.getByTestId("bw-home").click();             // mid-booking → home
  await expect(page.getByTestId("book-me")).toBeVisible();

  await page.getByTestId("book-me").click();
  await page.getByTestId("svc").first().click();
  await page.getByTestId("next").click();
  await page.getByTestId("staff").first().click();
  await page.getByTestId("next").click();
  await page.locator(".bw-day").nth(1).click();
  await page.getByTestId("slot").first().click();
  await page.getByTestId("next").click();
  await page.locator("#bw-phone").fill("4085550199");
  await page.locator("#bw-name").fill("Home Test");
  await page.getByTestId("next").click();
  await expect(page.getByTestId("booked")).toBeVisible();
  await expect(page.getByTestId("bw-see-salon")).toContainText("See our photos, services + team");
  await page.getByTestId("bw-see-salon").click();
  await expect(page.getByTestId("book-me")).toBeVisible();
});
