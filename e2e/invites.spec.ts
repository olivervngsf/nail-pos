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
