import { expect, test } from "@playwright/test";

// Test copy (sign-in off): sample menu + staff, saved on this device only.
test("front desk builds a ticket, takes cash with change + tips, ticket stays paid after reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  await expect(page.getByTestId("charge")).toBeDisabled();

  // Gel color manicure ($45) by Kim
  await page.getByTestId("add-service").click();
  await page.getByLabel("Search services").fill("gel color man");
  await page.getByRole("button", { name: /Gel color manicure/ }).click();
  await page.getByTestId("pick-Kim").click();
  // Eyebrows ($12+ starting price) by Tuyết: charge waits for the final price
  await page.getByTestId("add-service").click();
  await page.getByRole("button", { name: /Eyebrows/ }).click();
  await page.getByTestId("pick-Tuyết").click();
  await expect(page.getByTestId("line")).toHaveCount(2);
  await expect(page.getByTestId("charge")).toBeDisabled();
  await expect(page.getByText("Set the final price")).toBeVisible();
  const price = page.getByLabel("Eyebrows: Final price");
  await price.fill("15");
  await price.blur();
  await expect(page.getByTestId("due")).toHaveText("$60.00");

  // $5 discount, needs a manager PIN
  await page.getByRole("button", { name: "Discount $ / %" }).click();
  await expect(page.getByTestId("apply-discount")).toBeDisabled();
  for (const d of "1357") await page.locator(".drawer").getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByTestId("approved")).toBeVisible();
  await page.getByTestId("apply-discount").click();
  await expect(page.getByTestId("discount-line")).toContainText("−$5.00");
  await expect(page.getByTestId("charge")).toHaveText("Charge $55.00");

  await page.getByTestId("charge").click();
  await page.getByTestId("pay-cash").click();
  // Kim $7 cash tip → total $62
  const tip = page.getByLabel("Cash tip Kim");
  await tip.fill("7");
  await tip.blur();
  await expect(page.getByTestId("cash-total")).toHaveText("$62.00");

  // short first (Cs2), then $100 (Cs1)
  for (const k of "50") await page.getByRole("button", { name: k, exact: true }).click();
  await expect(page.getByTestId("change-box")).toHaveAttribute("data-short", "true");
  await expect(page.getByText("Client gave $50.00 — not enough")).toBeVisible();
  await expect(page.getByTestId("cash-received")).toBeDisabled();
  await page.getByRole("button", { name: "$100", exact: true }).click();
  await expect(page.getByTestId("change")).toHaveText("$38.00");

  // offline: cash still works
  await page.context().setOffline(true);
  await page.getByTestId("cash-received").click();
  await expect(page.getByTestId("paid-total")).toHaveText("$62.00 cash");
  await expect(page.getByTestId("salon-keeps")).toHaveText("$55.00");
  await page.getByRole("button", { name: "No receipt" }).click();
  await page.context().setOffline(false);

  await page.reload();
  await expect(page.getByTestId("paid-total")).toHaveText("$62.00 cash");
  await page.goto("/checkout");
  await expect(page.getByText(/Paid today · \$62\.00/)).toBeVisible();
  expect(errors).toEqual([]);
});
