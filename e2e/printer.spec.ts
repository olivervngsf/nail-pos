import { expect, test } from "@playwright/test";

test("printer settings: toggle parts, preview changes, save; staff slip lists every ticket", async ({ page }) => {
  await page.goto("/settings/printer");
  const paper = page.getByTestId("ps-paper");
  await expect(paper).toContainText("Gel manicure - Kim");
  await page.getByRole("switch", { name: "Tech name on each service" }).click();
  await expect(paper).not.toContainText("- Kim");
  await page.getByRole("button", { name: "Staff slip" }).click();
  await expect(paper).not.toContainText("Ticket #1011");
  await page.getByRole("switch", { name: "Every ticket" }).click();
  await expect(paper).toContainText("Ticket #1011");
  await page.getByRole("switch", { name: "By check / in cash" }).click();
  await expect(paper).not.toContainText("By check");
  await page.getByRole("button", { name: "Ticket slip" }).click();
  const top = await paper.locator("div").nth(2).innerText();
  expect(top.trim()).toBe("Kim"); // tech name sits right under the date
  await expect(paper).toContainText("Nov 17, 2026, 2:05 PM");
  await page.getByRole("button", { name: "Staff slip" }).click();
  await page.getByTestId("ps-save").click();
  await expect(page.getByText("Saved. Every device prints this way now.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Staff slip" }).click();
  await expect(page.getByTestId("ps-paper")).toContainText("Ticket #1011");
});
