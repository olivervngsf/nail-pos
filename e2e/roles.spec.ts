import { expect, test } from "@playwright/test";

// Test copy (owner, no Supabase env): owner turns refunds off for managers, lets the front desk give discounts; kept on the device.
test("roles + permissions: owner changes what managers and the front desk may do", async ({ page }) => {
  await page.goto("/settings/roles");
  await expect(page.getByTestId("roles-save")).toBeDisabled();
  const refund = page.getByTestId("perm-ok.refund").getByRole("switch");
  await expect(refund).toHaveAttribute("aria-checked", "true");
  await refund.click();
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Front desk" }).click();
  const disc = page.getByTestId("perm-ok.discount").getByRole("switch");
  await expect(disc).toHaveAttribute("aria-checked", "false");
  await disc.click();
  await expect(page.getByTestId("perm-set.team")).toHaveCount(0); // front desk never opens Settings
  await page.getByTestId("roles-save").click();
  await expect(page.getByTestId("roles").getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("perm-ok.refund").getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Front desk" }).click();
  await expect(page.getByTestId("perm-ok.discount").getByRole("switch")).toHaveAttribute("aria-checked", "true");
});
