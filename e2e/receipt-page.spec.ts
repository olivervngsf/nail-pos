import { test, expect } from "@playwright/test";

// Client's digital receipt: after paying, ways back to the salon (Book again, Directions, see the salon) + "1 point" (not "1 points").
const R = {
  salon: "Lotus Demo Nails", salonPhone: "+14085550100", salonAddress: "1550 S Bascom Ave, Campbell, CA 95008", bookSlug: "demo",
  number: 1279, status: "paid", at: "2026-11-26T08:52:00Z", client: "Lan",
  lines: [{ kind: "service", name: "Gel manicure", cents: 3500, tech: "Kim" }], subtotal: 3500, discount: 0, tip: 0, total: 3500,
  points: { earned: 1, used: 0, balance: 1, kind: "points", rewardPoints: 100, rewardCents: 1000 },
  pay: { method: "cash", cents: 3500, given: 3500, change: 0, brand: null, last4: null },
};

test("receipt links back to the salon's booking page", async ({ page }) => {
  await page.route("**/api/receipt?*", (r) => r.fulfill({ json: R }));
  await page.goto("/r/0123456789abcdef");
  await expect(page.getByTestId("digital-receipt")).toBeVisible();
  await expect(page.getByTestId("receipt-points")).toContainText("+1 point today. You have 1 point.");
  await expect(page.getByTestId("receipt-book")).toHaveAttribute("href", "/demo");
  await expect(page.getByTestId("receipt-visit")).toHaveAttribute("href", "/demo");
  await expect(page.getByTestId("receipt-directions")).toHaveAttribute("href", /maps\.google\.com/);
});

test("no booking page = no Book again, Directions still there", async ({ page }) => {
  await page.route("**/api/receipt?*", (r) => r.fulfill({ json: { ...R, bookSlug: null, points: { ...R.points, earned: 2, balance: 5 } } }));
  await page.goto("/r/0123456789abcdef");
  await expect(page.getByTestId("receipt-points")).toContainText("+2 points today. You have 5 points.");
  await expect(page.getByTestId("receipt-book")).toHaveCount(0);
  await expect(page.getByTestId("receipt-directions")).toBeVisible();
});
