import { expect, test } from "@playwright/test";

// Test version (NEXT_PUBLIC_SMS_LOGIN unset): any 6 digits sign in.
test("owner goes from sign-up to a ready salon, and it survives a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const foot = page.locator(".foot");
  await page.goto("/setup");
  await page.fill("#on", "Mai Nguyen");
  await page.fill("#ph", "4085550110");
  await page.getByRole("button", { name: "Text me a code" }).click();
  await page.getByRole("button", { name: "Fill test code" }).click();
  await page.getByRole("button", { name: "Verify" }).click();

  await page.fill("#salonName", "Mai Nails");
  await foot.getByRole("button", { name: "Continue" }).click();
  await foot.getByRole("button", { name: "Use the template" }).click();
  await expect(page.getByText("Check your services")).toBeVisible();
  await foot.getByRole("button", { name: /Save \d+ services/ }).click();

  await page.getByRole("button", { name: "+ Add staff" }).click();
  await page.fill("#nn", "Linh Tran");
  await page.fill("#np", "4085550177");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invite waiting")).toBeVisible();
  await foot.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Connect with Stripe" }).click();
  await page.getByRole("button", { name: "Agree and submit" }).click();
  await foot.getByRole("button", { name: "Continue" }).click();
  await page.fill("#pc", "tempo-quote-lima");
  await page.getByRole("button", { name: "Connect reader" }).click();
  await foot.getByRole("button", { name: "Continue" }).click();
  await foot.getByRole("button", { name: "Skip for now" }).click(); // printer
  await foot.getByRole("button", { name: "Continue" }).click(); // device
  await foot.getByRole("button", { name: "Skip for now" }).click(); // clients
  await page.getByRole("button", { name: "Charge $1.00 on the reader" }).click();
  await expect(page.getByText("Paid $1.00")).toBeVisible();
  await foot.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Mai Nails is ready" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Mai Nails is ready" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("salon info: closing before opening blocks Continue", async ({ page }) => {
  await page.goto("/setup");
  await page.fill("#ph", "4085550110");
  await page.getByRole("button", { name: "Text me a code" }).click();
  await page.getByRole("button", { name: "Fill test code" }).click();
  await page.getByRole("button", { name: "Verify" }).click();
  await page.fill("#salonName", "Mai Nails");
  await page.getByLabel("Mon closes").selectOption("08:00");
  await expect(page.getByText("Closes before it opens")).toBeVisible();
  await expect(page.locator(".foot").getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("staff joins in Vietnamese, weak PIN refused, then clocks in", async ({ page }) => {
  await page.goto("/join/TEST1?n=Linh%20Tran&r=Tech&s=Mai%20Nails&o=Mai");
  await page.getByRole("button", { name: "Yes, this is me" }).click();
  await page.getByRole("button", { name: "Tiếng Việt" }).click();
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  for (const k of "1234") await page.locator(".key", { hasText: new RegExp(`^${k}$`) }).click();
  await expect(page.getByText("Dễ đoán quá. Thử số khác.")).toBeVisible();
  for (const pass of [0, 1]) {
    for (const k of "2580") await page.locator(".key", { hasText: new RegExp(`^${k}$`) }).click();
    if (pass === 0) await expect(page.getByText("Nhập lại")).toBeVisible();
  }
  await page.getByRole("button", { name: "Bỏ qua" }).click();
  await page.getByRole("button", { name: "Mở trang chính" }).click();
  await page.getByRole("button", { name: "Chấm công vào" }).click();
  await expect(page.getByText("Đã chấm công")).toBeVisible();
});

test("setup wizard has its layout (side steps on desktop, top bar on phone)", async ({ page }, info) => {
  await page.goto("/setup");
  await page.fill("#ph", "4085550110");
  await page.getByRole("button", { name: "Text me a code" }).click();
  await page.getByRole("button", { name: "Fill test code" }).click();
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(".wiz")).toHaveCSS("display", "flex");
  if (info.project.name === "desktop") {
    await expect(page.locator(".side")).toHaveCSS("width", "288px");
    await expect(page.locator(".st.now")).toHaveCSS("font-weight", "600");
  } else {
    await expect(page.locator(".mtop")).toHaveCSS("display", "flex");
  }
  await expect(page.locator(".foot")).toHaveCSS("position", "sticky");
});
