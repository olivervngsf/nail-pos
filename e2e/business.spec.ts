import { expect, test } from "@playwright/test";

// Test copy (no Supabase env): sample business details, owner can fill + confirm.
test("business details: missing list, EIN check, confirm makes it ready", async ({ page }) => {
  await page.goto("/settings/business");
  await expect(page.getByTestId("business")).toBeVisible();
  await expect(page.getByTestId("business-state")).toContainText("Still needed");
  await page.getByTestId("biz-ein").fill("1234");
  await expect(page.getByTestId("biz-save")).toBeDisabled();
  await page.getByTestId("biz-ein").fill("123456789");
  await expect(page.getByTestId("biz-ein")).toHaveValue("12-3456789");
  await page.getByTestId("biz-confirm").check();
  await expect(page.getByTestId("business-state")).toContainText("Ready");
  await page.getByTestId("biz-save").click();
  await expect(page.getByTestId("business").getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByTestId("biz-ein")).toHaveValue("");
});
