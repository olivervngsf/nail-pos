import { expect, test } from "@playwright/test";

// Test copy (sign-in off): sample day + sample week.
test("close day: open tickets → count drawer to a match → card total → tips → closed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/close-day");
  await expect(page.getByTestId("cd-open")).toBeVisible();
  await expect(page.getByTestId("cd-next-count")).toBeDisabled();
  await page.getByTestId("leave-1041").click();
  await page.getByTestId("leave-1042").click();
  await page.getByTestId("cd-next-count").click();

  await expect(page.getByTestId("cd-expected")).toHaveText("$560.00");
  const set = async (bill: string, n: string) => page.getByLabel(`$${bill} count`, { exact: true }).fill(n);
  await set("100", "2"); await set("50", "2"); await set("20", "8"); await set("10", "5"); await set("5", "6"); await set("1", "18");
  await expect(page.getByTestId("cd-diff")).toContainText("Short $2.00");
  await page.getByRole("button", { name: "One more $1", exact: true }).click();
  await page.getByRole("button", { name: "One more $1", exact: true }).click();
  await expect(page.getByTestId("cd-counted")).toHaveText("$560.00");
  await expect(page.getByTestId("cd-diff")).toHaveAttribute("data-match", "true");
  await page.getByTestId("cd-next-card").click();

  await page.getByTestId("cd-check-stripe").click();
  await expect(page.getByTestId("cd-card")).toContainText("matches");
  await page.getByTestId("cd-next-tips").click();
  await expect(page.getByTestId("cd-tips")).toContainText("Kim");
  await page.getByTestId("cd-finish").click();
  await expect(page.getByTestId("cd-done")).toContainText("Day closed");
  await expect(page.getByTestId("cd-done-cash")).toContainText("Drawer matched");
  expect(errors).toEqual([]);
});

test("payout sheet: totals, check % changes the split, CSV export", async ({ page }) => {
  await page.goto("/payouts");
  await expect(page.getByTestId("po-Kim")).toContainText("$1,616.00");
  await expect(page.getByTestId("po-total")).toHaveText("$4,030.00");
  const pct = page.getByLabel("Check % for Kim");
  await pct.fill("100");
  await pct.blur();
  await expect(page.getByTestId("po-Kim")).toContainText("$1,616.00$0.00");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("po-csv").click()]);
  expect(dl.suggestedFilename()).toMatch(/^payroll-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("print my earnings: name + PIN shows only that person's slip", async ({ page }) => {
  await page.goto("/earnings");
  await page.getByTestId("earn-Kim").click();
  for (const d of "2580") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByTestId("slip")).toBeVisible();
  await expect(page.getByTestId("slip-total")).toHaveText("$1,616.00");
  await page.getByTestId("earn-done").click();
  await expect(page.getByTestId("earn-Kim")).toBeVisible();
});
