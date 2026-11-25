import { expect, test } from "@playwright/test";

// Phone friendly: desk screens keep a bottom menu, nothing scrolls sideways, typing never zooms on iPhone (16px+).
const DESK = ["/checkout", "/calendar", "/calendar?view=week", "/clients", "/clients-ver-c", "/clients-ver-d", "/close-day", "/payouts", "/numbers", "/gift-cards", "/loyalty", "/settings/team", "/settings/pin", "/settings/printer", "/settings/booking-page", "/settings/tap-to-pay", "/settings/salon", "/me", "/me/more"];

test("phone: bottom menu on every desk screen, no sideways scroll, inputs don't zoom", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  test.setTimeout(90_000);
  for (const url of DESK) {
    await page.goto(url);
    const menu = page.getByRole("navigation", { name: "Menu" });
    await expect(menu, url).toBeVisible();
    const box = (await menu.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(Math.round(box.y + box.height), `${url} menu at the bottom`).toBe(vp.height);
    expect(box.width, `${url} menu full width`).toBe(vp.width);
    const facts = await page.evaluate(() => ({
      wide: document.documentElement.scrollWidth - window.innerWidth,
      small: [...document.querySelectorAll<HTMLElement>("input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea")]
        .filter((el) => el.offsetWidth > 0 && parseFloat(getComputedStyle(el).fontSize) < 16).length,
    }));
    expect(facts.wide, `${url} sideways scroll`).toBeLessThanOrEqual(0);
    expect(facts.small, `${url} inputs under 16px`).toBe(0);
  }
});

test("phone checkout: Charge stays on screen, More holds the extras, cash button is pinned, no menu on the ticket", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  const inView = async (id: string) => {
    const box = (await page.getByTestId(id).boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.y, `${id} top`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${id} bottom`).toBeLessThanOrEqual(vp.height);
  };
  await page.goto("/checkout");
  await inView("new-ticket");
  await page.getByTestId("new-ticket").click();
  for (const [q, tech] of [["gel color man", "Kim"], ["deluxe", "Tuyết"], ["regular spa", "Kim"]]) {
    await page.getByTestId("add-service").click();
    await page.getByLabel("Search services").fill(q);
    await page.locator(".drawer .opt").first().click();
    await page.getByTestId(`pick-${tech}`).click();
  }
  await expect(page.getByTestId("line")).toHaveCount(3);
  await expect(page.getByRole("navigation", { name: "Menu" })).toBeHidden();
  await inView("charge"); // no scrolling to take money
  await page.getByTestId("ticket-more").click();
  await expect(page.getByTestId("more-discount")).toBeVisible();
  await expect(page.getByTestId("more-gift")).toBeVisible();
  await page.getByTestId("more-note").click();
  await expect(page.getByLabel("Note", { exact: true })).toBeVisible();
  await page.getByTestId("charge").click();
  await page.getByTestId("pay-cash").click();
  await inView("cash-received");
  await page.getByRole("button", { name: "$200", exact: true }).click();
  await page.getByTestId("cash-received").click();
  await inView("new-ticket");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

// Founder Admin on a phone: health table = one card per salon, salon page tabs scroll sideways inside their bar only.
test("phone: admin health table + salon tabs fit the screen", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  for (const url of ["/admin/salons", "/admin/salons/s-bella?tab=overview", "/admin/salons/s-bella?tab=speed", "/admin/salons/s-bella?tab=texting"]) {
    await page.goto(url);
    await expect(page.locator(".ad-main"), url).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide, `${url} sideways scroll`).toBeLessThanOrEqual(0);
  }
  await page.goto("/admin/salons");
  const cell = page.getByTestId("salon-row").first().getByTestId("c-stripe");
  expect((await cell.boundingBox())!.height, "check cells big enough to tap").toBeGreaterThanOrEqual(44);
});
