import { expect, test } from "@playwright/test";

test("kit page shows every piece with no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/kit");
  await expect(page.getByRole("heading", { level: 1, name: "Design kit" })).toBeVisible();
  for (const name of ["Charge $83.00", "Open drawer", "Show toast"]) await expect(page.getByRole("button", { name })).toBeVisible();
  await page.getByRole("button", { name: "Open drawer" }).click();
  await expect(page.getByRole("dialog", { name: "Add staff" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a write saved offline is sent once when back online", async ({ page, context }, info) => {
  const url = `/kit?tag=${info.project.name}-${Date.now()}`;
  await page.goto(url);
  const applied = page.getByTestId("applied");
  await expect(applied).toHaveText(/Sent to server: \d+/);
  const before = Number((await applied.textContent())!.match(/\d+/)![0]);
  const pill = page.getByTestId("sync-pill").first();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.getByTestId("save-test").click();
  await expect(pill).toHaveAttribute("data-state", "offline");
  await expect(pill).toContainText("1 change waiting to sync");
  await expect(page.getByRole("status").filter({ hasText: "No internet. Keep working" })).toBeVisible();

  await page.reload().catch(() => {}); // offline reload fails: the write must survive on the device anyway
  await context.setOffline(false);
  await page.goto(url);
  await expect(page.getByTestId("sync-pill").first()).toHaveAttribute("data-state", "online", { timeout: 15_000 });
  await page.getByRole("button", { name: "↻" }).click();
  await expect(applied).toHaveText(`Sent to server: ${before + 1}`);
});

test("language switch shows Vietnamese", async ({ page }) => {
  await page.goto("/kit");
  await page.getByRole("button", { name: "Tiếng Việt" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Bộ thiết kế" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Bộ thiết kế" })).toBeVisible(); // remembered
});

test("every banner and toast closes with its X; offline folds into the pill and comes back", async ({ page, context }) => {
  await page.goto("/kit");
  const late = page.getByRole("status").filter({ hasText: "PolishOS payment is late" });
  await expect(late).toBeVisible();
  await late.getByRole("button", { name: "Close" }).click();
  await expect(late).toHaveCount(0);

  await page.getByRole("button", { name: "Show toast" }).click();
  const toast = page.locator(".toast");
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Close" }).click();
  await expect(toast).toHaveCount(0);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const off = page.getByTestId("offline-banner");
  await expect(off).toBeVisible();
  await off.getByRole("button", { name: "Close" }).click();
  await expect(off).toHaveCount(0);
  await page.getByTestId("sync-pill").first().click(); // folded: tap the pill = open again
  await expect(off).toBeVisible();
  await context.setOffline(false);
});
