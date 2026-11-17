import { expect, test } from "@playwright/test";

// Email sign-in (test copy): add a sign-in email from the profile menu (code confirms it), then sign in with email + code.
test("add a sign-in email from the profile menu", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  test.skip(test.info().project.name === "phone", "profile menu lives on desk screens (desktop)");
  await page.goto("/checkout");
  await page.getByTestId("account-menu").click();
  await expect(page.getByTestId("signin-email")).toContainText("None yet");
  await page.getByTestId("add-email").click();
  await page.getByTestId("add-email-input").fill("owner@example.com");
  await page.getByTestId("add-email-send").click();
  await page.getByTestId("add-email-code").fill("123456");
  await page.getByTestId("add-email-confirm").click();
  await expect(page.getByTestId("signin-email")).toContainText("owner@example.com");
  expect(errors).toEqual([]);
});

test("sign in with email + code", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByTestId("use-email").click();
  await page.getByTestId("email").fill("not-an-email");
  await page.getByTestId("email-send").click();
  await expect(page.getByText("Enter an email like")).toBeVisible();
  await page.getByTestId("email").fill("owner@example.com");
  await page.getByTestId("email-send").click();
  await page.getByRole("button", { name: "Fill test code" }).click();
  await page.getByTestId("email-verify").click();
  await expect(page).toHaveURL(/\/setup/);
  expect(errors).toEqual([]);
});
