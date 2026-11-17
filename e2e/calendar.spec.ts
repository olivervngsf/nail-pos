import { expect, test } from "@playwright/test";

// Booking calendar (test copy): book by phone with a service, drag to move (15-min snap) + undo, overlap shown,
// check in → ticket at checkout, week + month views, booking made offline stays.
test("calendar: book, move with undo, check in, week + month", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const phone = test.info().project.name === "phone";
  await page.goto("/calendar");
  await expect(page.getByTestId("cal-block").first()).toBeVisible();

  // Book (offline): phone first, a service, Kim, 3:00 PM
  await page.context().setOffline(true);
  await page.getByTestId("book-new").click();
  await page.getByTestId("book-time").selectOption(String(15 * 60));
  await page.getByTestId("book-phone").fill("4085550188");
  await page.getByTestId("book-name").fill("Vy Ho");
  await page.getByTestId("book-svc").first().click();
  await page.getByTestId("book-staff-Kim").click();
  await page.getByTestId("book-save").click();
  await expect(page.locator('[data-testid="cal-block"][data-name="Vy Ho"]')).toBeVisible();
  await page.context().setOffline(false);
  await page.reload();
  const vy = page.locator('[data-testid="cal-block"][data-name="Vy Ho"]');
  await expect(vy).toContainText("3:00 PM");

  if (!phone) {
    // Drag Vy down 1 hour → 4:00 PM, then Undo → back at 3:00 PM
    const box = (await vy.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 8 + 66, { steps: 6 });
    await page.mouse.up();
    await expect(vy).toContainText("4:00 PM");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(vy).toContainText("3:00 PM");
    // Overlap is shown (Mai + Rosa with Kim), never moved
    await expect(page.locator('[data-testid="cal-block"][data-name="Rosa Diaz"]')).toContainText("Overlap");
  }

  // Open → confirm → check in → ticket with the service + Kim
  await vy.click();
  await page.getByTestId("confirm").click();
  await expect(vy).toContainText("Confirmed");
  await vy.click();
  await page.getByTestId("check-in").click();
  await expect(page).toHaveURL(/\/checkout\//);
  await expect(page.getByTestId("line")).toHaveCount(1);
  await expect(page.getByTestId("line")).toContainText("Kim");

  if (!phone) {
    await page.goto("/calendar?view=week");
    await expect(page.getByTestId("week-block").first()).toBeVisible();
    await page.goto("/calendar?view=month");
    await expect(page.getByTestId("month-day")).toHaveCount(42);
  }
  expect(errors).toEqual([]);
});
