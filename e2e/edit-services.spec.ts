import { expect, test } from "@playwright/test";

// Edit services on a booking that's already made: add one from the menu, remove one, Save. Same start, longer end.
test("booking details: edit services (add, remove, save, undo)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/calendar");
  await expect(page.getByTestId("cal-block").first()).toBeVisible();

  await page.getByTestId("book-new").click();
  await page.getByTestId("book-time").fill("2p");
  await page.getByTestId("book-time").press("Enter");
  await page.getByTestId("book-phone").fill("4085550177");
  await page.getByTestId("book-name").fill("Quynh Le");
  await page.getByTestId("book-q").fill("p1");
  await page.getByTestId("book-q").press("Enter");
  await page.getByTestId("book-save").click();
  const block = page.locator('[data-testid="cal-block"][data-name="Quynh Le"]');
  await expect(block).toBeVisible();

  await block.click();
  const before = await page.getByTestId("appt-total").innerText();
  await page.getByTestId("svc-edit-open").click();
  await expect(page.getByTestId("svc-edit")).toBeVisible();
  // the only service can't be removed (a booking always keeps one)
  await expect(page.getByTestId("svc-remove")).toBeDisabled();
  await page.getByTestId("svc-add-q").fill("p1");
  await page.getByTestId("svc-add").first().click();
  await expect(page.getByTestId("svc-remove")).toHaveCount(2);
  await page.getByTestId("svc-save").click();
  await expect(page.getByText(/Services saved · 2 services/)).toBeVisible();

  await block.click();
  await expect(page.getByTestId("appt-total")).not.toHaveText(before);
  // remove the added one again → back to the first total
  await page.getByTestId("svc-edit-open").click();
  await page.getByTestId("svc-remove").last().click();
  await page.getByTestId("svc-save").click();
  await block.click();
  await expect(page.getByTestId("appt-total")).toHaveText(before);
  expect(errors).toEqual([]);
});
