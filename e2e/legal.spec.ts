import { expect, test } from "@playwright/test";

// Terms, privacy and text-message terms are public pages in plain words; login + booking link to them.
test("legal pages open and link to each other", async ({ page }) => {
  await page.goto("/legal/terms");
  await expect(page.getByTestId("legal-title")).toHaveText("Terms of Service");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByTestId("legal-title")).toHaveText("Privacy Policy");
  await page.getByRole("link", { name: "Text messages" }).click();
  await expect(page.getByTestId("legal-title")).toHaveText("Text messages");
  await expect(page.getByText("Reply STOP to any text").first()).toBeVisible();
});

test("short links + login footer", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await page.goto("/login");
  await page.getByRole("link", { name: "Terms" }).click();
  await expect(page.getByTestId("legal-title")).toHaveText("Terms of Service");
});
