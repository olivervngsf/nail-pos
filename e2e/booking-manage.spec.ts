import { expect, test } from "@playwright/test";

// Client change / cancel link (test copy, slug "demo"): book → link on the booked screen → move to another time
// (own time is crossed out) → cancel (asks first) → canceled page offers a new booking. Unknown link = not found.
test("booking link: change time, then cancel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/demo");
  await page.getByTestId("book-me").click();
  await page.getByTestId("svc").first().click();
  await page.getByTestId("next").click();
  await page.getByTestId("staff").nth(1).click();
  await page.getByTestId("next").click();
  await page.locator(".bw-day").nth(1).click();
  await page.getByTestId("slot").first().click();
  const was = (await page.getByTestId("slot").first().textContent())!;
  await page.getByTestId("next").click();
  await page.locator("#bw-phone").fill("4085550177");
  await page.locator("#bw-name").fill("Mia Chen");
  await page.getByTestId("next").click();
  await page.getByTestId("manage-link").click();

  const m = page.getByTestId("manage");
  await expect(m).toContainText("Your booking, Mia");
  await expect(m).toContainText(was);
  await page.getByTestId("m-change").click();
  await expect(page.locator(".bw-mine")).toHaveText(was);
  const free = page.locator('[data-testid="m-slot"]:not(.bw-mine)').nth(3);
  const now = (await free.textContent())!;
  await free.click();
  await page.getByTestId("m-save").click();
  await expect(m).toHaveAttribute("data-view", "moved");
  await expect(m).toContainText(now);

  // The link still works after a reload, with the new time.
  await page.reload();
  await expect(m).toContainText(now);
  await page.getByTestId("m-cancel").click();
  await page.getByTestId("m-cancel-yes").click();
  await expect(m).toContainText("Booking canceled");
  await page.reload();
  await expect(m).toContainText("Booking canceled");
  await expect(page.getByTestId("m-change")).toHaveCount(0);

  await page.goto("/b/demo-nope");
  await expect(page.getByText("We couldn't find this booking.")).toBeVisible();
  expect(errors).toEqual([]);
});
