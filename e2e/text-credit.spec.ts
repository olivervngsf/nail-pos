import { expect, test } from "@playwright/test";

const VI = "Cosmo Nails: Mừng lễ giảm 15% mọi dịch vụ đến 30/11. Đặt lịch: polishosapp.com/cosmo. Trả lời STOP để ngừng.";

// Test version (sign-in off): sample credit $18.40, 212 clients said yes.
test("text credit: ring popover, manage page, add credit, promo send with cost check", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/texting");
  await page.evaluate(() => localStorage.removeItem("nailpos.credit.demo"));
  await page.reload();
  await expect(page.getByTestId("tc-balance")).toHaveText("$18.40");
  await expect(page.getByTestId("tc-rows")).toContainText("Holiday 15% off");

  if (info.project.name === "desktop") {
    // The ring lives in the left menu; Settings now dims the menu (window over the app), so check it from Checkout.
    await page.goto("/checkout");
    const ring = page.getByTestId("credit-ring");
    await expect(ring).toHaveAttribute("data-level", "good");
    await ring.click();
    await expect(page.getByTestId("credit-pop")).toContainText("≈ 920 promo texts left");
    await expect(page.getByTestId("credit-amount")).toHaveText("$18.40");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("credit-pop")).toHaveCount(0);
    await page.goto("/settings/texting");
  }

  await page.getByTestId("tc-pick-1000").click();
  await page.getByTestId("tc-add").click();
  await expect(page.getByTestId("tc-balance")).toHaveText("$28.40");
  await expect(page.getByTestId("tc-rows")).toContainText("Added credit");

  // Promo send: 212 people × 2 parts (accents) = $8.48; no accents = 1 part = $4.24
  await page.getByTestId("promo-open").click();
  await page.getByTestId("promo-msg").fill(VI);
  await expect(page.getByTestId("promo-parts")).toContainText("has Vietnamese accents · 2 part");
  await expect(page.getByTestId("promo-total")).toHaveText("$8.48");
  await page.getByRole("switch", { name: "Send without accents" }).click();
  await expect(page.getByTestId("promo-total")).toHaveText("$4.24");
  await expect(page.getByTestId("promo-send")).toHaveText("Send to 212 · $4.24");
  await page.getByTestId("promo-send").click();
  await expect(page.getByTestId("tc-balance")).toHaveText("$24.16");
  await expect(page.getByTestId("tc-rows")).toContainText("Cosmo Nails: Mung le");
  expect(errors).toEqual([]);
});
