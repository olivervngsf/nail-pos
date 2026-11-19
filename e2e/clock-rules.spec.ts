import { expect, test } from "@playwright/test";

// Clock-in rules (test copy: sample data). Settings shows the 4 choices; Wi-Fi shows the "staff may not have the password" note;
// the time clock shows the 30-second QR when the rule allows it.
test("settings: clock-in rule choices + Wi-Fi note; time clock shows the QR", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/clock-in");
  await expect(page.getByTestId("rule-off")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("rule-wifi").click();
  await expect(page.getByTestId("rule-wifi")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("clock-in-rules")).toContainText("pick QR");
  await page.getByTestId("save-wifi").click();
  await expect(page.getByTestId("clock-in-rules")).toContainText("Salon Wi-Fi");

  await page.goto("/clock");
  await expect(page.getByTestId("clock-qr").locator("svg")).toBeVisible();
  expect(errors).toEqual([]);
});
