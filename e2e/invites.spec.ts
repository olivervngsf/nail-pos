import { expect, test } from "@playwright/test";

// Invite-only salons (test copy): type a code → see the salon → sign in to join; admin makes a salon + invite.
test("invite code screen: wrong length, then a code opens the invite", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/invite");
  await page.getByTestId("invite-code").fill("abc");
  await page.getByTestId("invite-check").click();
  await expect(page.getByText("8 letters and numbers, like")).toBeVisible();
  await page.getByTestId("invite-code").fill("abcd2345");
  await expect(page.getByTestId("invite-code")).toHaveValue("ABCD-2345");
  await page.getByTestId("invite-check").click();
  await expect(page.getByTestId("invite-title")).toContainText("Join");
  await page.getByTestId("invite-join").click();
  await expect(page).toHaveURL(/\/login\?invite=ABCD2345/);
  expect(errors).toEqual([]);
});

test("invite link opens straight on the salon", async ({ page }) => {
  await page.goto("/invite/ABCD-2345");
  await expect(page.getByTestId("invite-title")).toContainText("Join");
});

test("admin: make a salon + owner invite", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin");
  const before = await page.getByTestId("a-row").count();
  await page.getByTestId("a-create").click();
  await expect(page.getByText("Fill in salon name")).toBeVisible();
  await page.getByTestId("a-salon").fill("Rose Nails");
  await page.getByTestId("a-owner").fill("Hoa");
  await page.getByTestId("a-phone").fill("4085550199");
  await page.getByTestId("a-create").click();
  await expect(page.getByTestId("a-row")).toHaveCount(before + 1);
  await expect(page.getByTestId("a-row").first()).toContainText("Rose Nails");
  await expect(page.getByTestId("a-row").first().getByTestId("a-code")).toHaveText("TEST-2345");
  expect(errors).toEqual([]);
});
