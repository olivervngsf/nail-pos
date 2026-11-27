import { expect, test } from "@playwright/test";

// Profile pop-up like Claude (board Profile pop-up A · C): rows, side menus, text size, tech phone sheet. Test copy.
test("desk pop-up: rows like the board, Language + Text size side menus, What's new", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 999) < 600, "phones use More instead of the left menu");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/checkout");
  await page.getByTestId("account-menu").click();
  const pop = page.getByTestId("account-pop");
  for (const w of ["My profile", "Settings", "Activity log", "Plan + usage", "Language", "Text size", "Get help", "What’s new", "Sign out"]) await expect(pop).toContainText(w);
  // The pop-up opens straight up above the avatar (not to the side).
  const a = await page.getByTestId("account-menu").boundingBox();
  const b = await pop.boundingBox();
  expect(b!.y + b!.height).toBeLessThanOrEqual(a!.y + 2);
  await page.getByTestId("pm-lang").click();
  await page.getByTestId("pm-lang-vi").click();
  await expect(pop).toContainText("Ngôn ngữ");
  await page.getByTestId("pm-lang").click();
  await page.getByTestId("pm-lang-en").click();
  await page.getByTestId("pm-size").click();
  await page.getByTestId("pm-size-large").click();
  await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  // The left menu still fits the screen at Large (avatar not pushed off the bottom).
  const av = await page.getByTestId("account-menu").boundingBox();
  const vh = page.viewportSize()!.height;
  expect(av!.y + av!.height).toBeLessThanOrEqual(vh + 2);
  await page.getByTestId("pm-size").click();
  await page.getByTestId("pm-size-normal").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-text", /./);
  await page.getByTestId("pm-news").click();
  await expect(page).toHaveURL(/\/settings\/whats-new$/);
  await expect(page.getByTestId("whats-new")).toContainText("New profile menu");
  expect(errors).toEqual([]);
});

test("tech phone: tap your face → sheet with own things only", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/t");
  await page.getByTestId("tech-me").click();
  const sheet = page.getByTestId("tech-sheet");
  await expect(sheet).toContainText("Tech · Test Nails · ••0142");
  for (const w of ["My profile", "My time", "My earnings", "Change my PIN", "Language", "Text size", "Get help", "Sign out"]) await expect(sheet).toContainText(w);
  await expect(sheet).not.toContainText("Settings");
  await expect(page.getByTestId("sheet-out")).toBeInViewport();
  await page.getByTestId("pm-lang").click();
  await expect(page.getByTestId("pm-lang-vi")).toBeVisible();
  await page.getByTestId("sheet-earnings").click();
  await expect(page).toHaveURL(/\/t\/earnings$/);
  expect(errors).toEqual([]);
});
