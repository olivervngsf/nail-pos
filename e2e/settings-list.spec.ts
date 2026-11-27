import { expect, test } from "@playwright/test";

// Settings like Claude (Nov 26, board "Settings like Claude · Tablet"). Test copy: sample owner, changes stay on the device.
// A small red PNG for the photo upload.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAMElEQVR4nO3NAQ0AAAQAMOTSP4UwYtjsL/Cc7rhQJ6tYLBaLxWKxWCwWi8VisfhpvCLkAaTnZDPmAAAAAElFTkSuQmCC", "base64");

test("profile: photo upload, name saved with ✓, language picker", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/me");
  await expect(page.getByTestId("me-photo")).toBeVisible();
  // photo: initials first, then the picked photo on the profile and the account button
  await expect(page.locator(".me-av img")).toHaveCount(0);
  await page.getByTestId("photo-input").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".me-av img")).toHaveCount(1);
  await expect(page.getByTestId("photo-remove")).toBeVisible();
  // ✓ Save: grey until the name changes
  const check = page.getByTestId("me-save");
  await expect(check).toBeDisabled();
  await page.getByTestId("me-name").fill("Mai N.");
  await expect(check).toBeEnabled();
  await check.click();
  await expect(check).toBeDisabled();
  // Language: a picker page with a ✓, back to Profile
  await page.getByTestId("me-language").click();
  await expect(page).toHaveURL(/\/me\/language$/);
  await page.getByTestId("lang-vi").click();
  await expect(page.getByTestId("lang-vi")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("lang-en").click();
  await page.getByTestId("bar-back").click();
  await expect(page).toHaveURL(/\/me$/);
  // photo removed → initials again
  await page.getByTestId("photo-remove").click();
  await expect(page.locator(".me-av img")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("salon info: ✓ Save in the header turns on with a change; Undo puts it back", async ({ page }) => {
  await page.goto("/settings/salon");
  const check = page.getByTestId("si-save");
  await expect(check).toBeDisabled();
  const name = page.getByLabel("Salon name");
  const was = await name.inputValue();
  await name.fill(`${was} 2`);
  await expect(check).toBeEnabled();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(name).toHaveValue(was);
  await expect(check).toBeDisabled();
});

test("phones + tablets: Settings is a list with values; a row opens its page", async ({ page }, info) => {
  test.skip(info.project.name === "desktop", "computers keep the menu beside the page");
  await page.goto("/settings");
  await expect(page.getByTestId("settings-list")).toBeVisible();
  await expect(page.getByTestId("row-language")).toContainText("English");
  await expect(page.getByTestId("row-pin")).toContainText("digit");
  await expect(page.getByTestId("row-devices")).toContainText("2 of 3 on");
  await expect(page.getByTestId("row-team")).toContainText("people");
  await expect(page.locator(".set-lrow")).toHaveCount(13); // the board's list: 4 + 4 + 5
  // full screen: the left / bottom menu sits under Settings (never on top of it)
  const onTop = await page.evaluate(() => [[10, 300], [innerWidth / 2, innerHeight - 10]].some(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".rail")));
  expect(onTop).toBe(false);
  await expect(page.getByTestId("settings-signout")).toBeVisible();
  await page.getByTestId("settings-account").click();
  await expect(page).toHaveURL(/\/me$/);
  await page.getByTestId("bar-back").click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByTestId("row-salon").click();
  await expect(page).toHaveURL(/\/settings\/salon$/);
  await expect(page.getByTestId("settings-search")).toBeHidden(); // a page shows ‹ · title · ✓, not the list's search
});

// One rule (Oliver, Nov 27): every item in the Settings menu opens INSIDE the Settings window, never a full page.
// Work screens (Gift cards, Payout sheet) are not in the menu; a page may only point to one with a "… ↗" link.
test("computers: every Settings menu item opens inside the window", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the side menu is beside the page on computers");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/settings/salon");
  const nav = page.locator(".set-nav");
  await expect(nav).toBeVisible();
  const hrefs = await nav.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  expect(hrefs.length).toBeGreaterThan(15);
  for (const href of hrefs) expect(href, `${href} must be a Settings page`).toMatch(/^\/(settings|me)(\/|$)/);
  expect(hrefs).not.toContain("/gift-cards");
  expect(hrefs).not.toContain("/payouts");
  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.locator(".set-win"), `${href} opens in the window`).toBeVisible();
    await expect(page.locator(".set-win .set-nav")).toBeVisible();
  }
  // Pay rules points to the payout sheet with the one "leaves Settings" link.
  await page.goto("/settings/pay-rules");
  await expect(page.getByTestId("pay-rule-row").first()).toBeVisible();
  await page.getByTestId("open-payouts").click();
  await expect(page).toHaveURL(/\/payouts$/);
  await expect(page.locator(".set-win")).toHaveCount(0);
});
