import { expect, test } from "@playwright/test";

// Settings → Team list: tiles filter the list, rows grouped by role, status = icon + word, quick Text invite.
test("team list: tiles filter, groups, status words, quick invite", async ({ page }) => {
  await page.goto("/settings/team");
  await expect(page.locator(".tm-gh")).toHaveCount(3);
  await expect(page.getByTestId("member-Linh Pham").getByTestId("member-status")).toContainText("Hasn't joined");
  await page.getByTestId("tile-invited").click();
  await expect(page.locator(".tm-gh")).toHaveCount(0);
  await expect(page.locator(".tm-row")).toHaveCount(1);
  await page.getByTestId("row-text-invite").click();
  await expect(page.locator(".toast, [role=status]").filter({ hasText: /Test version|text/i }).first()).toBeVisible();
  await page.getByTestId("tile-invited").click();
  await expect(page.locator(".tm-gh")).toHaveCount(3);
});
