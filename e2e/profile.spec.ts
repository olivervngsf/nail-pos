import { expect, test, type Page } from "@playwright/test";

// Profile, PIN + Settings (test copy: sample data, any PIN opens).
const typePin = async (page: Page, pin: string) => {
  for (const d of pin) await page.locator(".faces-pin .key", { hasText: new RegExp(`^${d}$`) }).click();
};

test("bottom-left profile pop-up opens My profile", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the left menu is a desk screen (desktop)");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/checkout");
  await page.getByTestId("account-menu").click();
  await expect(page.getByTestId("account-pop")).toBeVisible();
  await page.getByTestId("go-me").click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByTestId("my-pin")).toContainText("6-digit PIN");
  expect(errors).toEqual([]);
});

test("time clock: face → PIN → clock in + pay sheet → back to faces", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/clock");
  await expect(page.getByTestId("faces")).toBeVisible();
  await page.getByTestId("face-Ngọc").click();
  await expect(page.locator(".faces-pin .dots i")).toHaveCount(6);
  await typePin(page, "258013");
  await expect(page.getByTestId("clock-panel")).toBeVisible();
  await page.getByTestId("clock-toggle").click();
  await expect(page.getByRole("status").filter({ hasText: "clocked in" })).toBeVisible();
  await expect(page.getByTestId("slip-total")).toBeVisible();
  await page.getByTestId("clock-done").click();
  await expect(page.getByTestId("faces")).toBeVisible();
  expect(errors).toEqual([]);
});

test("settings: add a team member, PIN rules to 10 digits, PIN activity", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/team");
  await expect(page.getByTestId("member-Kim Vo")).toBeVisible();
  await page.getByTestId("add-member").click();
  await page.locator("#m-name").fill("Linh Tran");
  await page.locator("#m-phone").fill("4085550199");
  await page.getByTestId("member-save").click();
  await expect(page.getByTestId("member-Linh Tran")).toBeVisible();

  await page.goto("/settings/pin");
  await page.getByTestId("len-10").click();
  await expect(page.getByTestId("len-10")).toHaveAttribute("aria-pressed", "true");

  await page.goto("/settings/pin-activity");
  await expect(page.getByTestId("pin-log")).toContainText("Wrong PIN");
  expect(errors).toEqual([]);
});
