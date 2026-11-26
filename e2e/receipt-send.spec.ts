import { expect, test } from "@playwright/test";

// Paid screen: Email / Text a receipt says what happened in Sent for this ticket (test copy: nothing is sent).
test("receipt by email: the paid screen says what happened", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  await page.getByTestId("add-service").click();
  await page.getByLabel("Search services").fill("regular spa");
  await page.locator(".drawer .opt").first().click();
  await page.getByTestId("pick-Kim").click();
  await page.getByTestId("charge").click();
  await page.getByTestId("pay-cash").click();
  await page.getByRole("button", { name: "$50", exact: true }).click();
  await page.getByTestId("cash-received").click();
  // design C: Email says "+ Add email" when nothing is on file; a tap opens a small card in place
  await expect(page.getByTestId("receipt-email")).toContainText("Add email");
  await page.getByTestId("receipt-email").click();
  await page.getByTestId("receipt-card").getByLabel("Client's email").fill("client@example.com");
  await page.getByTestId("receipt-card").getByRole("button", { name: "Send email" }).click();
  await expect(page.getByTestId("receipt-result")).toContainText("Test version: not sent to c•••@example.com");
});
