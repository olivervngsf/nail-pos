import { expect, test } from "@playwright/test";

test("printer settings: toggle parts, preview changes, save; staff slip lists every ticket", async ({ page }) => {
  await page.goto("/settings/printer");
  const paper = page.getByTestId("ps-paper");
  await expect(paper).toContainText("Gel manicure - Kim");
  await page.getByRole("switch", { name: "Tech name on each service" }).click();
  await expect(paper).not.toContainText("- Kim");
  await page.getByRole("button", { name: "Staff slip" }).click();
  await expect(paper).not.toContainText("(tip $");
  await page.getByRole("switch", { name: "Every ticket" }).click();
  await expect(paper).toContainText("Gel manicure (tip $9.00)");
  await page.getByRole("switch", { name: "By check / in cash" }).click();
  await expect(paper).not.toContainText("By check");
  await page.getByTestId("ps-save").click();
  await expect(page.getByText("Saved. Every device prints this way now.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Staff slip" }).click();
  await expect(page.getByTestId("ps-paper")).toContainText("Gel manicure (tip $9.00)");
});
