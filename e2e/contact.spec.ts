import { expect, test } from "@playwright/test";

// Test copy (no Supabase env, signed in as the owner): owner picks who gets the Call / Text buttons on a booking.
test("call + text clients: owner always, others by switch, save", async ({ page }) => {
  await page.goto("/settings/contact");
  const box = page.getByTestId("contact-settings");
  await expect(box).toContainText("Only you, the owner, see a client's full phone number");
  await expect(page.getByTestId("ct-save")).toBeDisabled();
  const techCall = page.getByRole("switch", { name: "Call button: Tech" });
  await expect(techCall).toHaveAttribute("aria-checked", "false");
  await techCall.click();
  await page.getByRole("switch", { name: "Text button: Front desk" }).click();
  await expect(page.getByTestId("ct-save")).toBeEnabled();
  await page.getByTestId("ct-save").click();
  await expect(box.getByText("Saved", { exact: true })).toBeVisible();
  await expect(techCall).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("ct-save")).toBeDisabled();
});
