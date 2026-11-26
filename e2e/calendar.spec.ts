import { expect, test } from "@playwright/test";

// Booking calendar (test copy): book by phone with a service, drag to move (15-min snap) + undo, overlap shown,
// check in → ticket at checkout, week + month views, booking made offline stays.
test("calendar: custom service saved to the menu needs an owner/manager PIN", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/calendar");
  await page.getByTestId("book-new").click();
  await page.getByTestId("cx-open").click();
  await page.getByTestId("cx-name").fill("Regular spa pedicure");
  await page.getByTestId("cx-price").fill("38");
  await page.getByTestId("cx-save").click();
  await expect(page.getByText("Already on the menu")).toBeVisible();   // same name as a menu service
  await expect(page.getByTestId("cx-add")).toBeDisabled();
  await page.getByTestId("cx-name").fill("Nail repair");
  await page.getByTestId("cx-price").fill("7");
  await page.getByTestId("cx-add").click();
  await expect(page.getByTestId("menu-ok")).toContainText("Nail repair");
  for (const k of "148203") await page.getByTestId("menu-ok").getByRole("button", { name: k, exact: true }).click();
  await expect(page.getByRole("button", { name: /^Remove Nail repair/ })).toBeVisible();
  await expect(page.getByTestId("menu-ok")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("calendar: break blocks time on a tech, not counted as a booking", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  test.skip(test.info().project.name === "phone", "right-click is for mouse; phone uses long-press on a booking");
  await page.goto("/calendar");
  await expect(page.getByTestId("cal-block").first()).toBeVisible();   // sample day loaded
  const all = page.getByTestId("count-all");
  const before = await all.textContent();
  const grid = page.getByTestId("cal-grid");
  const g = (await grid.boundingBox())!;
  await grid.click({ button: "right", position: { x: 40, y: g.height - 30 } });  // last slot of the day: always empty
  await page.getByRole("menuitem", { name: /Block 30 min/ }).click();
  const brk = page.locator('[data-testid="cal-block"][data-name="__break"]');
  await expect(brk).toContainText("Break");
  await expect(all).toHaveText(before!);                                           // a break is not a booking
  await brk.click();
  await page.getByTestId("break-remove").click();
  await expect(brk).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("calendar: book, move with undo, check in, week + month", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const phone = test.info().project.name === "phone";
  await page.goto("/calendar");
  await expect(page.getByTestId("cal-block").first()).toBeVisible();

  // Book (offline): phone first, a service, Kim, 3:00 PM
  await page.context().setOffline(true);
  await page.getByTestId("book-new").click();
  // Start time is typed ("3p" = 3:00 PM); service by its code: "p1" + Enter
  await page.getByTestId("book-time").fill("3p");
  await page.getByTestId("book-time").press("Enter");
  await expect(page.getByTestId("book-time")).toHaveValue("3:00 PM");
  await page.getByTestId("book-phone").fill("4085550188");
  await page.getByTestId("book-name").fill("Vy Ho");
  await page.getByTestId("book-q").fill("p1");
  await page.getByTestId("book-q").press("Enter");
  await expect(page.getByRole("button", { name: /^Remove Regular spa pedicure/ })).toBeVisible();
  // Skills: a pedicure needs "Pedicure" → Tuyết is a good fit, Kim isn't set up for it (facts only, still pickable)
  await expect(page.getByTestId("skill-need")).toContainText("Pedicure");
  await expect(page.getByTestId("book-staff-Tuyết").getByTestId("good-fit")).toBeVisible();
  await expect(page.getByTestId("book-staff-Kim").getByTestId("good-fit")).toHaveCount(0);
  await expect(page.getByTestId("book-staff-Kim").locator(".sk-tag.no")).toHaveText("Pedicure");
  await page.getByTestId("book-staff-Kim").click();
  await page.getByTestId("book-save").click();
  await expect(page.locator('[data-testid="cal-block"][data-name="Vy Ho"]')).toBeVisible();
  await page.context().setOffline(false);
  await page.reload();
  const vy = page.locator('[data-testid="cal-block"][data-name="Vy Ho"]');
  await expect(vy).toContainText("pedicure · 3:00");

  if (!phone) {
    // Drag Vy down 1 hour → 4:00 PM, then Undo → back at 3:00 PM
    const box = (await vy.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 8 + 66, { steps: 6 });
    await page.mouse.up();
    await expect(vy).toContainText("pedicure · 4:00");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(vy).toContainText("pedicure · 3:00");
    // Overlap is shown (Mai + Rosa with Kim), never moved
    await expect(page.locator('[data-testid="cal-block"][data-name="Rosa Diaz"]')).toContainText("Overlap");
  }

  // Open → confirm → check in → ticket with the service + Kim
  await vy.click();
  await page.getByTestId("confirm").click();
  await expect(vy).toContainText("Confirmed");
  if (!phone) {
    // Right-click → menu → client is here (green "Here"), then 15 min later + Undo
    await vy.click({ button: "right" });
    await expect(page.getByTestId("cal-menu")).toBeVisible();
    await page.getByRole("menuitem", { name: "Client is here" }).click();
    await expect(vy).toContainText("Here");
    await vy.click({ button: "right" });
    await page.getByRole("menuitem", { name: "15 min later" }).click();
    await expect(vy).toContainText("pedicure · 3:15");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(vy).toContainText("pedicure · 3:00");
  } else {
    await vy.click();
    await page.getByTestId("here-btn").click();
    await expect(vy).toContainText("Here");
  }
  await vy.click();
  await page.getByTestId("check-in").click();
  await expect(page).toHaveURL(/\/checkout\//);
  await expect(page.getByTestId("line")).toHaveCount(1);
  await expect(page.getByTestId("line")).toContainText("Kim");
  const ticketUrl = page.url();

  // Scan a ticket slip from the calendar: desk scanner (types fast + Enter, no click) and the search box
  await page.goto("/calendar");
  await expect(page.getByTestId("cal-grid")).toBeVisible();
  const slip = ticketUrl.replace("/checkout/", "/t/ticket/");
  if (!phone) {
    await page.keyboard.type(slip, { delay: 5 });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(ticketUrl);
    await page.goto("/calendar");
  }
  await page.getByTestId("scan-btn").click();
  await page.getByTestId("scan-typed").fill(slip);
  await page.getByTestId("scan-open").click();
  await expect(page).toHaveURL(ticketUrl);

  if (!phone) {
    await page.goto("/calendar?view=week");
    await expect(page.getByTestId("week-block").first()).toBeVisible();
    await page.goto("/calendar?view=month");
    await expect(page.getByTestId("month-day")).toHaveCount(42);
  }
  expect(errors).toEqual([]);
});

test("calendar: search finds clients by phone / #number / name, Tab switches, Enter opens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  test.skip(test.info().project.name === "phone", "the search box is a desk (wide screen) control; phones use Scan");
  await page.goto("/calendar");
  await expect(page.getByTestId("cal-block").first()).toBeVisible();
  const box = page.getByTestId("cal-search");
  await box.fill("0142");
  await expect(page.getByTestId("sr-chip")).toHaveText("Phone");
  await expect(page.getByTestId("sr-row").first()).toContainText("Lan Tran");
  await expect(page.getByTestId("sr-row").first()).toContainText("•••-0142");
  await box.fill("Lan");
  await expect(page.locator('[data-testid="sr-row"][data-kind="client"]')).toHaveCount(2);
  await box.press("Tab");                                       // All → Clients
  await expect(page.getByTestId("sr-tab-clients")).toHaveAttribute("aria-selected", "true");
  await box.fill("#48213");
  await expect(page.getByTestId("sr-chip")).toHaveText("Client #");
  await expect(page.getByTestId("sr-row")).toHaveCount(1);
  await box.press("Enter");
  await expect(page).toHaveURL(/\/clients\/c1/);
  expect(errors).toEqual([]);
});
