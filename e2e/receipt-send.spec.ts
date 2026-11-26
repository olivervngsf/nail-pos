import { expect, test } from "@playwright/test";

// Paid screen: Email / Text a receipt says what happened under the buttons (test copy: nothing is sent).
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
  await page.getByRole("button", { name: "Email ›" }).click();
  await page.getByLabel("Email").fill("client@example.com");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("receipt-result")).toHaveText("Test version: nothing is sent.");
});
