import { expect, test } from "@playwright/test";

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Booking page (test copy, slug "demo"): a client books from Instagram with no account → lands on the calendar;
// that time is gone for the next client (no double booking). Kiosk check-in joins the line; tech books on her phone
// + undo; owner settings show bookings by source.
test("booking page → calendar, no double booking, kiosk, staff phone, settings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const bookKim = async () => {
    await page.goto("/demo?src=instagram");
    await page.getByTestId("book-me").click();
    await page.getByTestId("svc").first().click();
    await page.getByTestId("next").click();
    await page.getByTestId("staff").nth(1).click();     // Kim
    await page.getByTestId("next").click();
    await page.locator(".bw-day").nth(1).click();        // tomorrow (or the next open day)
    await expect(page.getByTestId("slot").first()).toBeVisible();
    return (await page.getByTestId("slot").first().textContent())!;
  };

  const first = await bookKim();
  await page.getByTestId("slot").first().click();
  await page.getByTestId("next").click();
  await page.locator("#bw-phone").fill("4085550142");
  await expect(page.getByText("Welcome back, Lan")).toBeVisible();
  await expect(page.locator("#bw-name")).toHaveValue("Lan");
  await page.locator("#bw-name").fill("Lan Tran");
  await page.getByTestId("next").click();
  await expect(page.getByTestId("booked")).toContainText("with Kim");

  // Same time with Kim is gone for the next client.
  const again = await bookKim();
  expect(again).not.toBe(first);

  // On the calendar with its source.
  await page.goto(`/calendar?view=day&d=${tomorrow()}`);
  const block = page.locator('[data-testid="cal-block"][data-name="Lan Tran"]');
  await expect(block).toBeVisible();
  await block.click();
  await expect(page.getByText("Instagram").first()).toBeVisible();

  // Kiosk: walk-in checks in → in line; welcome shows 1 ahead.
  await page.goto("/kiosk");
  await page.getByTestId("ki-start").click();
  for (const d of "4085550199") await page.locator(".ki-keys .key", { hasText: new RegExp(`^${d}$`) }).click();
  await page.getByTestId("ki-phone-ok").click();
  await page.getByTestId("ki-name").fill("Bao");
  await page.getByTestId("ki-tile").first().click();
  await page.getByTestId("ki-checkin").click();
  await expect(page.getByTestId("ki-done")).toContainText("B1");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("ki-wait")).toContainText("1 ahead");

  // Tech books a regular into her own free time, then undoes it.
  await page.goto("/t/book");
  await page.getByTestId("sb-start").click();
  await page.getByTestId("sb-regular").first().click();
  await page.getByTestId("sb-svc").first().click();
  await page.getByTestId("sb-next").click();
  await page.locator(".bw-day").nth(1).click();
  await page.getByTestId("sb-slot").first().click();
  await page.getByTestId("sb-next").click();
  await page.getByTestId("sb-book").click();
  await expect(page.getByTestId("sb-done")).toBeVisible();
  await page.getByRole("button", { name: "Back to my day" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Booking undone")).toBeVisible();

  // Owner settings: link is live, bookings by source include the page + kiosk.
  await page.goto("/settings/booking-page");
  await expect(page.getByTestId("bp-state")).toContainText("/demo");
  await expect(page.getByTestId("bp-source").filter({ hasText: "Instagram" })).toBeVisible();
  await expect(page.getByTestId("bp-source").filter({ hasText: "Kiosk" })).toBeVisible();

  expect(errors).toEqual([]);
});
