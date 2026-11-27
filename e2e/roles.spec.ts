import { expect, test } from "@playwright/test";

// Test copy (owner, no Supabase env): quick level per role on top, checklist grid below (board A + D); kept on the device.
test("roles + permissions: pick a level, fine-tune a box, save", async ({ page }) => {
  await page.goto("/settings/roles");
  await expect(page.getByTestId("level-manager-standard")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("level-front_desk-careful")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("roles-save")).toBeDisabled();
  // front desk: Standard = discounts only
  await page.getByTestId("level-front_desk-standard").click();
  await expect(page.getByTestId("perm-front_desk-ok.discount")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("perm-front_desk-ok.refund")).toHaveAttribute("aria-checked", "false");
  // manager: untick refunds = Custom
  await page.getByTestId("perm-manager-ok.refund").click();
  await expect(page.getByTestId("levels-manager")).toContainText("Custom");
  await expect(page.getByTestId("roles-short")).toContainText("Front desk can give a discount.");
  await page.getByTestId("roles-save").click();
  await expect(page.getByTestId("roles-save")).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("perm-manager-ok.refund")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("level-front_desk-standard")).toHaveAttribute("aria-checked", "true");
});
