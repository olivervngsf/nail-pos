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
  // phones: discount, gift card, note and slip sit behind one More button next to Charge
  if ((page.viewportSize()?.width ?? 999) < 600) { await page.getByTestId("ticket-more").click(); await page.getByTestId("more-discount").click(); }
  else await page.getByRole("button", { name: "Discount $ / %" }).click();
  await expect(page.getByTestId("apply-discount")).toBeDisabled();
  for (const d of "135790") await page.locator(".drawer").getByRole("button", { name: d, exact: true }).click();
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
  // receipt (design C): Text with no phone on file → type it in place → listed under "Sent for this ticket"
  await expect(page.getByTestId("receipt-text")).toContainText("Add phone");
  await page.getByTestId("receipt-text").click();
  await page.getByTestId("receipt-card").getByRole("textbox").fill("4085550142");
  await page.getByTestId("receipt-card").getByRole("button", { name: "Send text" }).click();
  await expect(page.getByTestId("receipt-sent")).toContainText("Texted to ••0142");
  await page.getByRole("button", { name: "No receipt" }).click();
  await page.context().setOffline(false);

  await page.reload();
  await expect(page.getByTestId("paid-total")).toHaveText("$62.00 cash");
  await page.goto("/checkout");
  await expect(page.getByText(/Paid today · \$62\.00/)).toBeVisible();
  expect(errors).toEqual([]);
});

// Gift cards (test copy): sell a plastic card with a service, then use it for part of the next ticket; a blank card is refused.
test("gift card: sold with a service, then pays part of the next ticket", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const gel = async () => {
    await page.goto("/checkout");
    await page.getByTestId("new-ticket").click();
    await page.getByTestId("add-service").click();
    await page.getByLabel("Search services").fill("gel color man");
    await page.getByRole("button", { name: /Gel color manicure/ }).click();
    await page.getByTestId("pick-Kim").click();
  };
  // Ticket A: $45 + plastic gift card $25 → $70 cash
  await gel();
  if ((page.viewportSize()?.width ?? 999) < 600) { await page.getByTestId("ticket-more").click(); await page.getByTestId("more-gift").click(); }
  else await page.getByTestId("add-gift").click();
  await page.getByTestId("gift-kind-plastic").click();
  await page.getByRole("button", { name: "$25", exact: true }).click();
  await page.getByTestId("gift-code").fill("6012 3456 7890 0147");
  await page.getByTestId("gift-look").click();
  await expect(page.getByTestId("gift-blank")).toContainText("0147");
  await page.getByTestId("gift-add").click();
  await expect(page.getByTestId("gift-line")).toHaveCount(1);
  await expect(page.getByTestId("charge")).toHaveText("Charge $70.00");
  await page.getByTestId("charge").click();
  await page.getByTestId("pay-cash").click();
  await expect(page.getByTestId("cash-total")).toHaveText("$70.00");
  await page.getByRole("button", { name: "$100", exact: true }).click();
  await page.getByTestId("cash-received").click();
  await expect(page.getByTestId("gift-sold")).toContainText("Gift card •••• 0147 is now active · $25.00");
  await expect(page.getByTestId("salon-keeps")).toHaveText("$45.00");

  // Ticket B: $45; a blank card is refused; card 0147 pays $25, $20 left in cash
  await gel();
  await page.getByTestId("charge").click();
  await page.getByTestId("pay-gift").click();
  await page.getByTestId("gift-code").fill("6012345678900148");
  await page.getByTestId("gift-look").click();
  await expect(page.getByTestId("gift-refused")).toContainText("This card was never sold");
  await page.getByTestId("gift-code").fill("6012 3456 7890 0147");
  await page.getByTestId("gift-look").click();
  await expect(page.getByTestId("gift-balance")).toHaveText("$25.00");
  await expect(page.getByTestId("gift-use-amt")).toHaveText("$25.00");
  await page.getByTestId("gift-use").click();
  await expect(page.getByTestId("pay-amount")).toHaveText("$20.00");
  await expect(page.getByTestId("gift-paid")).toContainText("−$25.00");
  await page.getByTestId("pay-cash").click();
  await expect(page.getByTestId("cash-total")).toHaveText("$20.00");
  await page.getByRole("button", { name: "$20", exact: true }).click();
  await page.getByTestId("cash-received").click();
  await expect(page.getByTestId("paid-total")).toHaveText("$20.00 cash");
  await expect(page.getByTestId("salon-keeps")).toHaveText("$45.00");

  // Ticket C: same card again → used up
  await gel();
  await page.getByTestId("charge").click();
  await page.getByTestId("pay-gift").click();
  await page.getByTestId("gift-code").fill("6012345678900147");
  await page.getByTestId("gift-look").click();
  await expect(page.getByTestId("gift-refused")).toContainText("No money left");
  expect(errors).toEqual([]);
});

test("split payment: $20 cash now, the rest in cash; paid screen shows both parts", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  await page.getByTestId("add-service").click();
  await page.getByLabel("Search services").fill("gel color man");
  await page.getByRole("button", { name: /Gel color manicure/ }).click();
  await page.getByTestId("pick-Kim").click();
  await page.getByTestId("charge").click();
  await page.getByTestId("pay-cash").click();
  for (const k of "20") await page.getByRole("button", { name: k, exact: true }).click();
  await page.getByTestId("cash-part").click();
  await expect(page.getByTestId("cash-parts")).toContainText("$20.00");
  await page.getByTestId("pay-cash").click();
  await expect(page.getByTestId("cash-total")).toHaveText("$25.00");
  for (const k of "25") await page.getByRole("button", { name: k, exact: true }).click();
  await page.getByTestId("cash-received").click();
  await expect(page.getByTestId("cash-part-done")).toContainText("$20.00");
  await expect(page.getByTestId("salon-keeps")).toHaveText("$45.00");
});
