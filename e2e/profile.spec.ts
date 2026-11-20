import { expect, test, type Page } from "@playwright/test";

// Profile, PIN + Settings (test copy: sample data, any PIN opens).
const typePin = async (page: Page, pin: string) => {
  for (const d of pin) await page.locator(".faces-pin .key", { hasText: new RegExp(`^${d}$`) }).click();
};

test("profile pop-up (left menu on desktop, bottom menu on phones) opens My profile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/checkout");
  if ((page.viewportSize()?.width ?? 999) < 600) { // phones: the profile sits under More
    await page.getByTestId("menu-more").click();
    await expect(page.getByTestId("more-menu")).toBeVisible();
    await expect(page.getByTestId("more-close")).toBeVisible();
  } else {
    await page.getByTestId("account-menu").click();
    await expect(page.getByTestId("account-pop")).toBeVisible();
  }
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

test("settings: payments shows Stripe connected, card reader can be added and removed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto("/settings/payments");
  await expect(page.getByTestId("settings-payments")).toContainText("Card payments");
  await expect(page.getByRole("link", { name: "Open Stripe dashboard" })).toBeVisible();

  await page.goto("/settings/reader");
  await expect(page.getByTestId("settings-reader")).toContainText("Front desk");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("settings-reader")).toContainText("No card reader yet");
  await expect(page.getByRole("button", { name: "Connect reader" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("devices: owner shows a QR, tablet types the code at /go and opens the front desk", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/devices");
  // on / off at a glance: 2 of 3 on, the kiosk is off with "last on"
  await expect(page.getByTestId("devices-on")).toHaveText("2 of 3 on");
  await expect(page.getByTestId("device-Front desk iPad")).toHaveAttribute("data-state", "on");
  await expect(page.getByTestId("device-Door kiosk")).toHaveAttribute("data-state", "off");
  await expect(page.getByTestId("device-Door kiosk")).toContainText("Last on");
  await page.getByTestId("add-device").click();
  await page.getByTestId("qr-make").click();
  await expect(page.getByTestId("qr-box").locator("svg")).toBeVisible();
  await expect(page.getByTestId("qr-code")).toHaveText("DEMO-2345");

  await page.goto("/go");
  await page.getByTestId("go-code").fill("abcd2345");
  await expect(page.getByTestId("go-code")).toHaveValue("ABCD-2345");
  await page.getByTestId("go-btn").click();
  await expect(page.getByTestId("go-done")).toContainText("is ready");
  await expect(page).toHaveURL(/\/(desk|today)/, { timeout: 8000 });
  expect(errors).toEqual([]);
});

test("my profile shows 2-step sign-in (off) and the health check answers", async ({ page, request }) => {
  await page.goto("/me");
  await expect(page.getByTestId("two-step-state")).toHaveText("Off");
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  expect((await r.json()).app).toBe("ok");
});
