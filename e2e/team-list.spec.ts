import { expect, test } from "@playwright/test";

// Settings → Team list: tiles filter the list, rows grouped by role, status = icon + word, quick Text invite.
test("team list: tiles filter, groups, status words, quick invite", async ({ page }) => {
  await page.goto("/settings/team");
  await expect(page.locator(".tm-gh")).toHaveCount(3);
  await expect(page.getByTestId("member-Linh Pham").getByTestId("member-status")).toContainText("Hasn't joined");
  await page.getByTestId("tile-invited").click();
  await expect(page.locator(".tm-gh")).toHaveCount(0);
  await expect(page.locator(".tm-row")).toHaveCount(1);
  await page.getByTestId("row-text-invite").click();
  await expect(page.locator(".toast, [role=status]").filter({ hasText: /Test version|text/i }).first()).toBeVisible();
  await page.getByTestId("tile-invited").click();
  await expect(page.locator(".tm-gh")).toHaveCount(3);
});

// Oliver (Nov 28): who-to-show is a dropdown on the right of the bar (not chips); on phones the tiles sit 3 in a row.
for (const [name, size] of [["phone", { width: 390, height: 844 }], ["tablet", { width: 820, height: 1180 }], ["desktop", { width: 1280, height: 800 }]] as const) {
  test(`team bar on ${name}: role dropdown right-aligned, filters the list; compact tiles`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "sizes set by hand below; run once");
    await page.setViewportSize(size);
    await page.goto("/settings/team");
    const role = page.getByTestId("team-role");
    await expect(role).toBeVisible();
    await expect(page.locator(".tm-bar .chip")).toHaveCount(0);
    const bar = await page.locator(".tm-bar").boundingBox();
    const sort = await page.getByTestId("team-sort").boundingBox();
    expect(Math.abs((bar!.x + bar!.width) - (sort!.x + sort!.width))).toBeLessThan(2); // dropdowns end at the right edge
    await role.selectOption("tech");
    await expect(page.locator(".tm-row").first()).toBeVisible();
    for (const r of await page.locator(".tm-row .tm-who .cap").allTextContents()) expect(r).toMatch(/Tech/);
    await page.getByTestId("tile-invited").click();
    await expect(role).toHaveValue("invited");
    if (name === "phone") {
      const tops = await page.locator(".tm-tiles .tm-tile:visible").evaluateAll((els) => els.slice(0, 3).map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(1); // first 3 tiles share one row
    }
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide).toBeLessThanOrEqual(0);
  });
}
