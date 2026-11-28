import { expect, test } from "@playwright/test";

// Tech profiles (board "Tech Profiles": C = team row + quick sheet on the booking page, B = full page), test copy.
test("booking page: team row → quick sheet → full page → Book with Kim", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByTestId("team-row")).toBeVisible();
  await page.getByTestId("team-tech").filter({ hasText: "Kim" }).click();
  const sheet = page.getByTestId("team-sheet");
  await expect(sheet).toContainText("Nail art");
  await expect(sheet).not.toContainText("Chrome"); // a waiting photo never shows to clients
  await sheet.getByTestId("team-more").click();
  await expect(page.getByTestId("team-profile")).toContainText("Kim");
  await page.getByTestId("team-book").click();
  await expect(page).toHaveURL(/\/demo\?with=/);
  await expect(page.getByTestId("svc").first()).toBeVisible(); // straight into booking, Kim already picked
});

test("tech fills in their profile; clients see it", async ({ page }) => {
  await page.goto("/t/me");
  await page.getByTestId("my-profile").click();
  await expect(page.getByTestId("profile-edit")).toBeVisible();
  await page.getByTestId("profile-about").fill("Gel art lover. Bring a photo!");
  await page.getByTestId("best-Gel").click();
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId("profile-save")).toBeDisabled();
  await page.goto("/demo");
  await page.getByTestId("team-tech").filter({ hasText: "Kim" }).click();
  await expect(page.getByTestId("team-sheet")).toContainText("Gel art lover");
});

test("owner OKs a waiting photo and asks a tech to update", async ({ page }) => {
  await page.goto("/settings/tech-profiles");
  await expect(page.getByTestId("tech-profiles")).toBeVisible();
  await page.getByTestId("tpo-review").first().click();
  await page.getByTestId("tpo-show").first().click();
  await page.keyboard.press("Escape"); // close the side panel
  await expect(page.getByTestId("tpo-review")).toHaveCount(0);
  await page.getByTestId("tpo-ask").first().click();
  await expect(page.getByTestId("tech-profiles")).toContainText("Asked");
  await page.goto("/settings/roles");
  await expect(page.getByTestId("perm-tech-pf.own")).toHaveAttribute("aria-checked", "true");
});
