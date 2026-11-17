import { expect, test } from "@playwright/test";

// Client details can't be changed by accident (test copy): on a ticket the client is a read-only card (Change client /
// Edit details), and editing someone on file asks for an owner or manager PIN first.
test("client on a ticket is read-only; editing needs a manager PIN", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  await page.getByLabel("Client phone").fill("3123123123");
  await page.getByLabel("New client's name").fill("Nam");
  await page.getByTestId("add-client").click();
  await expect(page.getByTestId("client-name")).toHaveText("Nam");
  await expect(page.getByLabel("Client phone")).toHaveCount(0);          // no typing over a client on the ticket
  await expect(page.getByLabel("New client's name")).toHaveCount(0);
  await page.getByTestId("change-client").click();                       // wrong person: start over
  await expect(page.getByLabel("Client phone")).toHaveValue("");
  await expect(page.getByTestId("client-name")).toHaveText("Walk-in");

  // Client page: Edit asks for the OK first, then the form opens
  await page.goto("/clients/c1");
  await page.getByTestId("client-edit").click();
  await expect(page.getByText("Owner or manager: type your PIN")).toBeVisible();
  await expect(page.getByTestId("client-save")).toHaveCount(0);
  for (const k of "1234") await page.getByRole("button", { name: k, exact: true }).click();
  await expect(page.getByTestId("client-ok")).toContainText("OK by Mai");
  await page.locator("#cs").fill("Coffin · long");
  await page.getByTestId("client-save").click();
  await expect(page.getByTestId("client-save")).toHaveCount(0);
  expect(errors).toEqual([]);
});
