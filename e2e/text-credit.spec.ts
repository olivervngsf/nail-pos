import { expect, test } from "@playwright/test";

// Test version (sign-in off): sample credit $18.40. Menu ring → popover → Manage credit → add $10.
test("text credit: ring popover, manage page, add credit", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/texting");
  await page.evaluate(() => localStorage.removeItem("nailpos.credit.demo"));
  await page.reload();
  await expect(page.getByTestId("tc-balance")).toHaveText("$18.40");
  await expect(page.getByTestId("tc-rows")).toContainText("Holiday 15% off");

  if (info.project.name === "desktop") {
    const ring = page.getByTestId("credit-ring");
    await expect(ring).toHaveAttribute("data-level", "good");
    await ring.click();
    await expect(page.getByTestId("credit-pop")).toContainText("≈ 920 promo texts left");
    await expect(page.getByTestId("credit-amount")).toHaveText("$18.40");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("credit-pop")).toHaveCount(0);
  }

  await page.getByTestId("tc-pick-1000").click();
  await page.getByTestId("tc-add").click();
  await expect(page.getByTestId("tc-balance")).toHaveText("$28.40");
  await expect(page.getByTestId("tc-rows")).toContainText("Added credit");
  expect(errors).toEqual([]);
});
