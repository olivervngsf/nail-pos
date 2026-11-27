import { expect, test } from "@playwright/test";

// Loyalty (test copy): owner rule; at checkout the client's points show, a reward is used only after asking, comes off
// what's due (tech keeps full price) and can be undone; client page by text code shows points + gift cards and adds a card.
test("loyalty: owner rule, reward at checkout (asks first), client page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/settings/loyalty");
  await expect(page.getByTestId("ly-members")).toHaveText("212");
  await expect(page.getByTestId("ly-preview")).toContainText("$10 reward");
  await expect(page.getByTestId("ly-link")).toContainText("/c/demo");

  // Checkout: Gel color manicure ($45) by Kim, client Lan (105 pts, reward ready)
  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  await page.getByTestId("add-service").click();
  await page.getByLabel("Search services").fill("gel color man");
  await page.getByRole("button", { name: /Gel color manicure/ }).click();
  await page.getByTestId("pick-Kim").click();
  await expect(page.getByTestId("due")).toHaveText("$45.00");
  await page.getByLabel("Client phone").fill("4085550142");
  await expect(page.getByTestId("points")).toContainText("105");
  await expect(page.getByTestId("reward-ready")).toContainText("$10");
  await page.getByTestId("reward-use").click();
  await expect(page.getByText("Do you want to use your $10 today or save it?")).toBeVisible();
  await expect(page.getByTestId("due")).toHaveText("$45.00");          // nothing taken until they say yes
  await page.getByTestId("reward-yes").click();
  await expect(page.getByTestId("due")).toHaveText("$35.00");
  await expect(page.getByTestId("reward-line")).toContainText("−$10.00");
  await expect(page.getByTestId("reward-used")).toContainText("+35");
  await page.getByTestId("reward-undo").click();
  await expect(page.getByTestId("due")).toHaveText("$45.00");

  // Client page: text code → points + gift cards → add a card
  await page.goto("/c/demo");
  await page.getByLabel("Your mobile number").fill("4085550142");
  await page.getByRole("button", { name: "Text me a code" }).click();
  await page.getByRole("button", { name: "Fill test code" }).click();
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByTestId("cp-points")).toContainText("105");
  await expect(page.getByTestId("cp-ready")).toContainText("$10 reward ready");
  await expect(page.getByTestId("cp-card")).toHaveCount(1);
  await page.getByTestId("cp-add").click();
  await page.getByTestId("cp-code").fill("6012 3456 7890 0147");
  await page.getByTestId("cp-add-save").click();
  await expect(page.getByTestId("cp-added")).toContainText("0147");
  await expect(page.getByTestId("cp-card")).toHaveCount(2);
  await expect(page.getByTestId("cp-book")).toHaveAttribute("href", "/demo");
  expect(errors).toEqual([]);
});
