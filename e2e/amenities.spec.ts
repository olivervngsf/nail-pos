import { expect, test } from "@playwright/test";

// Amenities (test copy): owner ticks what the salon offers in Settings → Booking page → clients see it on the
// booking page; the digital receipt shows the same chips.
test("owner picks amenities → booking page shows them", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByTestId("amenities")).toContainText("Free wine"); // sample salon starts with a few

  await page.goto("/settings/booking-page");
  const card = page.getByTestId("bp-amenities");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("bp-save-amen")).toBeDisabled();
  await page.getByTestId("amen-wine").click();       // off
  await page.getByTestId("amen-parking").click();    // on
  await expect(page.getByTestId("amen-parking")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("bp-save-amen").click();
  await expect(page.getByTestId("bp-save-amen")).toBeDisabled();

  await page.goto("/demo");
  const list = page.getByTestId("amenities");
  await expect(list).toContainText("Free parking");
  await expect(list).not.toContainText("Free wine");
});

test("receipt shows the salon's amenities", async ({ page }) => {
  await page.route("**/api/receipt?*", (r) => r.fulfill({ json: {
    salon: "Lotus Demo Nails", salonPhone: null, salonAddress: null, bookSlug: "demo", amenities: ["wine", "wifi"],
    number: 1, status: "paid", at: "2026-11-27T18:00:00Z", client: null, lines: [], subtotal: 0, discount: 0, tip: 0, total: 0, points: null, pay: null,
  } }));
  await page.goto("/r/0123456789abcdef");
  await expect(page.getByTestId("amenities")).toContainText("Free wine");
  await expect(page.getByTestId("amenities")).toContainText("Free Wi-Fi");
});
