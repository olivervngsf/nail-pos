import { expect, test } from "@playwright/test";

// Phone friendly: desk screens keep a bottom menu, nothing scrolls sideways, typing never zooms on iPhone (16px+).
const DESK = ["/checkout", "/calendar", "/calendar?view=week", "/clients", "/close-day", "/payouts", "/numbers", "/gift-cards", "/loyalty", "/settings/team", "/settings/pin", "/settings/printer", "/settings/booking-page", "/me"];

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
