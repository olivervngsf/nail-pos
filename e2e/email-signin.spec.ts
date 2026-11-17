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
  await expect(page.getByTestId("add-email-sent")).toContainText("Check your email");
  await page.getByTestId("add-email-code").fill("123456");
  await page.getByTestId("add-email-confirm").click();
  await expect(page.getByTestId("signin-email")).toContainText("owner@example.com");
  expect(errors).toEqual([]);
});

// The "Yes, this is my email" button opens /auth/confirm; a missing/old link says so instead of hanging.
test("email confirm link: bad link shows a way back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/auth/confirm");
  await expect(page.getByTestId("confirm-email")).toHaveAttribute("data-state", "bad");
  await expect(page.getByText("This link didn’t work")).toBeVisible();
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

// Password (test copy): set one from the menu, then sign in with it; forgot password = code → new password.
test("set a password from the profile menu", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  test.skip(test.info().project.name === "phone", "profile menu lives on desk screens (desktop)");
  await page.goto("/checkout");
  await page.getByTestId("account-menu").click();
  await expect(page.getByTestId("password-state")).toContainText("None yet");
  await page.getByTestId("set-password").click();
  await page.getByTestId("set-password-input").fill("short");
  await expect(page.getByTestId("set-password-save")).toBeDisabled();
  await page.getByTestId("set-password-input").fill("nails2026!");
  await page.getByTestId("set-password-save").click();
  await expect(page.getByTestId("password-state")).toContainText("••••");
  expect(errors).toEqual([]);
});

test("sign in with password, and forgot password", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByTestId("use-password").click();
  await page.getByTestId("pw-id").fill("4085550110");
  await expect(page.getByTestId("pw-id")).toHaveValue("(408) 555-0110");
  await page.getByTestId("pw-password").fill("nails2026!");
  await page.getByTestId("pw-signin").click();
  await expect(page).toHaveURL(/\/setup/);

  // Next visit opens on password (remembered on this device) → forgot flow.
  await page.goto("/login");
  await page.getByTestId("forgot").click();
  await page.getByTestId("reset-id").fill("owner@example.com");
  await page.getByTestId("reset-send").click();
  await page.getByRole("button", { name: "Fill test code" }).click();
  await page.getByTestId("reset-verify").click();
  await page.getByTestId("reset-new").fill("newpass2026");
  await page.getByTestId("reset-save").click();
  await expect(page).toHaveURL(/\/setup/);
  expect(errors).toEqual([]);
});
