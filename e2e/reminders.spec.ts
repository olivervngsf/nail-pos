import { expect, test } from "@playwright/test";

// Test copy (no Supabase env): owner picks reminder times + test mode; the plan line says what a client gets.
test("booking reminders: pick times, test mode, save", async ({ page }) => {
  await page.goto("/settings/reminders");
  await expect(page.getByTestId("rem-plan")).toHaveText("Clients get a confirmation right away, then a reminder 24h before and 2h before.");
  await expect(page.getByTestId("rem-save")).toBeDisabled();
  await page.getByRole("group", { name: "1st reminder" }).getByRole("button", { name: "48h", exact: true }).click();
  await page.getByRole("switch", { name: "Test reminders" }).click();
  await expect(page.getByTestId("rem-plan")).toContainText("48h before and 2h before");
  await expect(page.getByTestId("rem-plan")).toContainText("3 minutes after booking");
  await page.getByTestId("rem-save").click();
  await expect(page.getByTestId("reminders").getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByTestId("reminders")).toContainText("On until");
});
