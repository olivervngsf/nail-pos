import { expect, test, type Page } from "@playwright/test";
import { DESK } from "./screens";

// iPhone Duo (Apple's foldable): folded 5.4" = 1398×2034 px, open 7.6" = 1878×2670 px, both at 3× → screen sizes below.
// Folded = phone layout (bottom menu). Open = small-tablet layout. Folding or opening must never lose a ticket.
const FOLDED = { width: 466, height: 678 };
const OPEN = { width: 626, height: 890 };
const OPEN_SIDEWAYS = { width: 890, height: 626 };

async function fits(page: Page, url: string) {
  const f = await page.evaluate(() => ({
    wide: document.documentElement.scrollWidth - window.innerWidth,
    small: [...document.querySelectorAll<HTMLElement>("input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea")]
      .filter((el) => el.offsetWidth > 0 && parseFloat(getComputedStyle(el).fontSize) < 16).length,
    // tap targets: visible buttons narrower or shorter than 32px (a finger can't hit them)
    tiny: [...document.querySelectorAll<HTMLElement>("button, a.btn, [role=tab]")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32); })
      .map((el) => (el.getAttribute("aria-label") || el.textContent || el.className).trim().slice(0, 30)),
  }));
  expect(f.wide, `${url} sideways scroll`).toBeLessThanOrEqual(0);
  expect(f.small, `${url} inputs under 16px`).toBe(0);
  return f.tiny;
}

for (const [name, size] of [["folded", FOLDED], ["open", OPEN], ["open sideways", OPEN_SIDEWAYS]] as const) {
  test(`iPhone Duo ${name}: every desk screen fits, has a menu, no zoom`, async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "touch screen only");
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    const tiny: string[] = [];
    for (const url of DESK) {
      await page.goto(url);
      const menu = page.getByRole("navigation", { name: "Menu" });
      await expect(menu, url).toBeVisible();
      if (size === FOLDED) {
        const box = (await menu.boundingBox())!;
        expect(Math.round(box.y + box.height), `${url} menu at the bottom`).toBe(size.height);
      }
      tiny.push(...(await fits(page, url)).map((t) => `${url}: ${t}`));
    }
    info.annotations.push({ type: "small taps", description: tiny.join(" | ") || "none" });
  });
}

test("iPhone Duo: open the phone mid-ticket, ticket stays, Charge on screen; fold back, same ticket", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "touch screen only");
  const inView = async (id: string) => {
    const box = (await page.getByTestId(id).boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.y, `${id} top`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${id} bottom`).toBeLessThanOrEqual(vp.height);
  };
  await page.setViewportSize(FOLDED);
  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  for (const [q, tech] of [["gel color man", "Kim"], ["deluxe", "Tuyết"]]) {
    await page.getByTestId("add-service").click();
    await page.getByLabel("Search services").fill(q);
    await page.locator(".drawer .opt").first().click();
    await page.getByTestId(`pick-${tech}`).click();
  }
  await expect(page.getByTestId("line")).toHaveCount(2);
  const url = page.url();
  for (const size of [OPEN, OPEN_SIDEWAYS, FOLDED]) {
    await page.setViewportSize(size);
    expect(page.url(), "no page change on fold").toBe(url);
    await expect(page.getByTestId("line")).toHaveCount(2);
    await inView("charge");
    await fits(page, `ticket ${size.width}×${size.height}`);
  }
  await page.getByTestId("charge").click();
  await page.getByTestId("pay-cash").click();
  await page.setViewportSize(OPEN);
  await inView("cash-received");
  await page.getByRole("button", { name: "$200", exact: true }).click();
  await page.getByTestId("cash-received").click();
  await inView("new-ticket");
});
