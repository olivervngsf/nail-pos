import { expect, test, type Page } from "@playwright/test";

// Settings map + Back rules (Nov 27, board "Settings Map + Back Rules"). Oliver found it on a tablet: PIN opened from the
// list, Back landed on Profile. Rules: one home per setting; Back goes up one step and says where (‹ Settings, ‹ Profile,
// ‹ Search). Checked on the 3 devices: phone, tablet (upright = list + sheet), computer (window, menu beside the page).
const SIZES = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1280, height: 800 } };

const back = (page: Page) => page.getByTestId("bar-back");

for (const size of ["phone", "tablet"] as const) {
  test(`${size}: a Me row opens its page and Back says ‹ Settings and returns to the list`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "sizes set by hand below; run once");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(SIZES[size]);
    await page.goto("/settings");
    await expect(page.getByTestId("settings-list")).toBeVisible();
    await expect(page.getByTestId("row-profile")).toHaveCount(0); // the name card is Profile
    for (const [row, url] of [["pin", /\/me\/pin$/], ["language", /\/me\/language$/], ["textSize", /\/me\/text-size$/]] as const) {
      await page.getByTestId(`row-${row}`).click();
      await expect(page).toHaveURL(url);
      await expect(back(page)).toContainText("Settings");
      await back(page).click();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(page.getByTestId("settings-list")).toBeVisible();
    }
    // Name card → Profile → Sign in (one level deeper) → ‹ Profile → ‹ Settings
    await page.getByTestId("settings-account").click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByTestId("sign-out")).toHaveCount(0); // Sign out lives on the list only
    await page.getByTestId("me-sign-in").click();
    await expect(page).toHaveURL(/\/me\/sign-in$/);
    await expect(back(page)).toContainText("Profile");
    await back(page).click();
    await expect(page).toHaveURL(/\/me$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/settings$/);
    // From search: Back says ‹ Search and the results are still there
    await page.getByTestId("settings-search").fill("lang");
    await page.getByTestId("row-language").click();
    await expect(page).toHaveURL(/\/me\/language$/);
    await expect(back(page)).toContainText("Search");
    await back(page).click();
    await expect(page.getByTestId("settings-search")).toHaveValue("lang");
    await expect(page.getByTestId("row-language")).toBeVisible();
    // The PIN page says what it is: length, who sets it, Change PIN, who to ask
    await page.getByTestId("settings-search").fill("");
    await page.getByTestId("row-pin").click();
    await expect(page.getByTestId("pin-page")).toContainText("Your PIN is set");
    await expect(page.getByTestId("pin-start")).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("desktop: PIN, Language + Text size sit in the side menu under Me; Sign in goes back to Profile", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "sizes set by hand");
  await page.setViewportSize(SIZES.desktop);
  await page.goto("/me/pin");
  await expect(page.getByTestId("nav-pin")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("nav-language")).toBeVisible();
  await expect(page.getByTestId("nav-textSize")).toBeVisible();
  await expect(back(page)).toBeHidden(); // the menu beside the page is the way back on computers
  await page.goto("/me/sign-in");
  await expect(back(page)).toContainText("Profile");
  await back(page).click();
  await expect(page).toHaveURL(/\/me$/);
});
