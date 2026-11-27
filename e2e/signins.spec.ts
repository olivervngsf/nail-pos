import { expect, test } from "@playwright/test";

// Profile → My sign-ins (test copy: this Mac, own iPhone app, an old Android phone not used 26 days).
test("my sign-ins: list, sign out one, sign out all others", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/me");
  await page.getByTestId("me-sign-ins").click();
  await expect(page).toHaveURL(/\/me\/sign-ins$/);
  await expect(page.getByTestId("signin-this")).toContainText("Mac · Chrome");
  await expect(page.getByTestId("signin-this")).toContainText("This device");
  const rows = page.getByTestId("signin-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Android phone" })).toContainText("Not used 26 days");
  await rows.filter({ hasText: "Android phone" }).getByTestId("signin-out").click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId("signin-history")).toContainText("Signed out");
  await page.getByTestId("signin-out-all").click();
  await page.getByTestId("signin-out-all-yes").click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByTestId("signin-this")).toBeVisible();
  await expect(page.getByTestId("signin-2step")).toBeVisible();
  expect(errors).toEqual([]);
});
