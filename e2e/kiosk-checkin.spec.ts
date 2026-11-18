import { expect, test } from "@playwright/test";

// A client who booked ahead checks in at the kiosk with their phone → the booking turns "Here" on the calendar
// (not in the chair yet), and the desk starts the service from there.
test("kiosk: booked client checks in → Here on the calendar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/calendar");
  const lan = page.locator('[data-testid="cal-block"][data-name="Lan Tran"]');
  await expect(lan).toBeVisible();
  await expect(lan).not.toContainText("Here");

  await page.goto("/kiosk");
  await page.getByTestId("ki-start").click();
  for (const d of "4085550142") await page.locator(".ki-keys .key", { hasText: new RegExp(`^${d}$`) }).click();
  await page.getByTestId("ki-phone-ok").click();
  await expect(page.getByTestId("ki-done")).toContainText("Lan");
  await expect(page.getByTestId("ki-tech")).toContainText("Kim");

  await page.goto("/calendar");
  await expect(lan).toContainText("Here");
  await lan.click();
  await expect(page.getByTestId("appt-status")).toContainText("Here");
  await expect(page.getByTestId("check-in")).toBeVisible();
  expect(errors).toEqual([]);
});
