import { expect, test, type Page } from "@playwright/test";

// Checkout home: two layouts (List / Cards). The owner picks one in Settings → Payments; both list the same tickets.
// Test copy (sign-in off): tickets are saved on this device only.
async function addTicket(page: Page, service: RegExp, tech: string) {
  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  await page.getByTestId("add-service").click();
  await page.getByRole("button", { name: service }).first().click();
  await page.getByTestId(`pick-${tech}`).click();
  await expect(page.getByTestId("line")).toHaveCount(1);
  await expect(page.getByTestId("charge")).toBeEnabled();
}

test("List layout: totals strip, Charge on the row goes straight to How to pay", async ({ page }) => {
  await addTicket(page, /Gel color manicure/, "Kim");
  await page.goto("/checkout");
  await expect(page.locator(".co-home")).toHaveAttribute("data-layout", "list");
  await expect(page.getByTestId("to-collect")).toHaveText("$45.00");
  await expect(page.getByTestId("ticket-row").first()).toContainText("Open 0 min");
  await page.getByTestId("row-charge").click();
  await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]+\?pay=1$/);
  await expect(page.getByTestId("pay-amount")).toHaveText("$45.00");
});

test("owner switches to Cards: big cards, tech filter, New ticket card", async ({ page }) => {
  await addTicket(page, /Gel color manicure/, "Kim");
  await addTicket(page, /Gel color manicure/, "Tuyết");
  await page.goto("/settings/payments");
  await page.getByTestId("home-layout-cards").click();
  await expect(page.getByTestId("home-layout")).toContainText("Saved");
  await page.goto("/checkout");
  await expect(page.locator(".co-home")).toHaveAttribute("data-layout", "cards");
  await expect(page.locator(".co-card")).toHaveCount(2);
  await page.locator(".co-chips").getByRole("button", { name: /Kim/ }).click();
  await expect(page.locator(".co-card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId("new-ticket").click();
  await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]+$/);
});
