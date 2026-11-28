import { expect, test } from "@playwright/test";

// Settings → Notifications (test copy: owner + one manager with no email). Who gets alerts, switches per alert, save.
test("notifications: pick who, switch an alert, save", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings/notifications");
  await expect(page.getByTestId("nt-people")).toContainText("Mai Nguyen");
  await expect(page.getByTestId("nt-people")).toContainText("Bao Tran");
  await expect(page.getByTestId("notifications")).toContainText("Bao Tran has no sign-in email yet");
  const refund = page.getByTestId("nt-refund_big");
  await expect(refund.getByRole("switch").first()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("nt-overtime")).toContainText("Starts soon");
  await page.getByTestId("nt-drawer_off").getByRole("switch").first().click();
  await page.getByTestId("nt-people").getByRole("button", { name: /Bao Tran/ }).click();
  await expect(page.getByTestId("notifications")).not.toContainText("has no sign-in email yet");
  await page.getByTestId("nt-save").click();
  await expect(page.getByTestId("notifications").getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByTestId("save-note")).toHaveCount(0);
  expect(errors).toEqual([]);
});
