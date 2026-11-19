import { expect, test } from "@playwright/test";

// Founder Admin · System (test copy = sample numbers): tiles, Running smooth list worst first, tick a check, add a cost.
test("admin System tab: checks + costs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin/system");
  await expect(page.getByTestId("tile-stripe-messages-24-h")).toContainText("41");
  await expect(page.getByTestId("tile-2-step-login-admins")).toContainText("2/2");
  const list = page.getByTestId("system-checks");
  await expect(list).toContainText("Texting 10DLC");
  await expect(list).toContainText("1 waiting (Lily Nails)");
  await expect(page.getByTestId("check-spending_alerts")).toContainText("Not set");

  // tick Spending alerts
  await page.getByTestId("check-spending_alerts").click();
  await page.getByLabel("What you checked (short)").fill("budget alerts on all 4");
  await page.getByTestId("check-save").click();
  await expect(page.getByTestId("check-spending_alerts")).toContainText("OK");
  await expect(page.getByTestId("check-spending_alerts")).toContainText("budget alerts on all 4");

  // add a cost line: total goes up
  await expect(page.getByTestId("system-costs")).toContainText("$84");
  await page.getByTestId("system-costs").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("What").fill("Sentry");
  await page.getByLabel("$ / month").fill("26");
  await page.getByTestId("cost-add").click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("system-costs")).toContainText("Sentry");
  await expect(page.getByTestId("system-costs")).toContainText("$110");
  expect(errors).toEqual([]);
});
