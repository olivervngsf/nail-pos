import { expect, test } from "@playwright/test";

// Client pay page: two layouts the owner picks in Settings → Payments. The preview pages use sample data (two techs),
// so the tip maths and the tech names can be checked without Stripe.
test("Receipt layout: bill, who did it, tip shared by service price", async ({ page }) => {
  await page.goto("/pay/preview-receipt");
  await expect(page.getByTestId("pay-visit")).toContainText("with Kim");
  await expect(page.getByText("Add a tip for Kim and Vy")).toBeVisible();
  await expect(page.getByTestId("pay-total")).toHaveText("$84.00"); // $70 + 20%
  await expect(page.getByTestId("tip-shares")).toContainText("$4.40");
  await expect(page.getByTestId("tip-shares")).toContainText("$9.60");
  await expect(page.getByTestId("tip-split")).toHaveCount(0); // Receipt never asks how to share
  await page.getByTestId("tip-none").click();
  await expect(page.getByTestId("pay-total")).toHaveText("$70.00");
  await expect(page.getByTestId("tip-shares")).toHaveCount(0);
  await page.getByTestId("tip-other").click();
  await page.getByTestId("tip-custom").fill("10");
  await expect(page.getByTestId("client-pay")).toHaveText("Pay $80.00");
});

test("Quick pay layout: one card, client shares the tip by service or evenly, EN / VI", async ({ page }) => {
  await page.goto("/pay/preview-quick");
  await expect(page.getByTestId("pay-visit")).toContainText("Your nail tech: Vy");
  await expect(page.getByTestId("pay-total")).toHaveText("$84.00");
  await page.getByTestId("tip-25").click();
  await page.getByTestId("tip-split").getByRole("button", { name: "Evenly" }).click();
  await expect(page.getByTestId("pay-total")).toHaveText("$87.50");
  await expect(page.getByTestId("tip-shares")).toContainText("$8.75");
  await page.getByRole("button", { name: "VI", exact: true }).click();
  await expect(page.getByText("Tip cho Kim và Vy")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
