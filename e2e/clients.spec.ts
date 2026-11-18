import { expect, test } from "@playwright/test";

// Clients (test copy): find by phone, filters, allergy shown first, full history, note on a visit, new client.
test("clients: find by phone, lost regulars, history with a note", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const phone = test.info().project.name === "phone";
  await page.goto("/clients");
  await expect(page.getByTestId("client-row").first()).toBeVisible();

  if (!phone) {
    await page.getByTestId("filter-lost").click();
    await expect(page.getByTestId("client-row")).toHaveCount(2);
    await expect(page.getByText(/2 regulars haven't come in/)).toBeVisible();
    await page.getByTestId("filter-all").click();
  }
  if (!phone) {
    // two clients named Lan Tran: told apart by the last 4 digits + a "Same name" tag
    await expect(page.getByTestId("same-name")).toHaveCount(2);
    // client number (random 5 digits): "#59081" finds the second Lan Tran only
    await page.getByTestId("client-search").fill("#59081");
    await expect(page.getByTestId("client-row")).toHaveCount(1);
    await expect(page.getByTestId("client-row")).toContainText("••0388");
    await page.getByTestId("client-search").fill("");
    await expect(page.getByTestId("client-row")).toHaveCount(6);
  }
  await page.getByTestId("client-search").fill("555-0142");
  await expect(page.getByTestId("client-row")).toHaveCount(1);
  await page.getByTestId("client-row").click();
  if (!phone) {
    await expect(page.getByTestId("client-panel")).toContainText("Lan Tran");
    await expect(page.getByTestId("client-care")).toContainText("no strong acetone");
    await expect(page.getByTestId("next-steps")).toBeVisible();
    // phone shows only the last 4 digits; owner/manager can Show the full number
    await expect(page.getByTestId("client-phone")).toHaveText("••0142");
    await expect(page.getByTestId("client-number")).toHaveText("#48213");
    await page.getByTestId("phone-show").click();
    await expect(page.getByTestId("client-phone")).toHaveText("(408) 555-0142");
    // private note (owner/manager) + care note (anyone)
    await expect(page.getByTestId("client-private")).toContainText("Asked twice for a discount");
    await page.getByTestId("care-note").click();
    await page.getByTestId("note-drawer-input").fill("Sensitive skin: no strong acetone soak. Latex allergy.");
    await page.getByTestId("note-drawer-save").click();
    await expect(page.getByTestId("client-care")).toContainText("Latex allergy");
    await page.getByTestId("open-history").click();
  }
  await expect(page).toHaveURL(/\/clients\/c1$/);
  await expect(page.getByTestId("client-care")).toContainText("no strong acetone");
  if (phone) await page.getByTestId("open-history").click();      // phone opens on the profile; history is one tap away
  await expect(page.getByTestId("all-photos")).toBeVisible();      // every photo, also ones not tied to a visit
  await expect(page.getByTestId("visit-open")).toContainText("Kim's note");
  await page.getByTestId("note-input").fill("Try a softer pink next time");
  await page.getByTestId("note-save").click();
  await expect(page.getByTestId("visit-open")).toContainText("Try a softer pink next time");

  if (!phone) {
    await page.goto("/clients");
    await page.getByTestId("client-new").click();
    await page.locator("#cn").fill("Anna Kim");
    await page.locator("#cp").fill("4085550199");
    await page.getByTestId("client-save").click();
    await expect(page.getByTestId("client-panel")).toContainText("Anna Kim");
    // a client with no phone: asked to add one, but a ticket still links to them by name
    await page.getByTestId("client-new").click();
    await page.locator("#cn").fill("No Phone");
    await page.getByTestId("client-save").click();
    await expect(page.getByTestId("client-panel")).toContainText("No Phone");
    await expect(page.getByTestId("no-phone")).toBeVisible();
    await page.getByTestId("client-ticket").click();
    await expect(page.getByTestId("client-name")).toHaveText("No Phone");
    await expect(page.getByTestId("no-phone-hint")).toBeVisible();
    await page.goto("/clients");
    // New ticket from a profile opens Checkout with that client on it
    await page.getByTestId("client-search").fill("555-0142");
    await expect(page.getByTestId("client-row")).toHaveCount(1);
    await page.getByTestId("client-row").click();
    await expect(page.getByTestId("client-panel")).toContainText("Lan Tran");
    await page.getByTestId("client-ticket").click();
    await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("client-name")).toHaveText("Lan Tran");
  }
  expect(errors).toEqual([]);
});
