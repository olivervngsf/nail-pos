import { expect, test } from "@playwright/test";

// Walk-ins + turns (test copy): desk adds a walk-in → waits on the waitlist (not on the grid); seat with a tech
// (turn order shown as facts) → moves into that tech's column + an open ticket; another walks out → recorded.
test("walk-in waitlist: add, seat with a tech, walked out", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/calendar");
  await expect(page.getByTestId("wait-pill")).toContainText("0 waiting");

  const add = async (name: string) => {
    await page.getByTestId("wait-pill").click();
    await page.getByRole("dialog").getByTestId("walkin-new").click();
    await page.getByTestId("walkin-name").fill(name);
    await page.getByTestId("walkin-svc").first().click();
    await page.getByTestId("walkin-save").click();
  };
  await add("Bao Tran");
  await expect(page.getByTestId("wait-pill")).toContainText("1 waiting");
  await expect(page.locator('[data-testid="cal-block"][data-name="Bao Tran"]')).toHaveCount(0);   // waiting = not on the grid

  // Seat Bao with Kim: turn order is shown, one is marked Next turn.
  await page.getByTestId("wait-pill").click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByTestId("wait-card").filter({ hasText: "Bao Tran" })).toContainText("B1");
  await dlg.getByTestId("seat").click();
  await expect(page.getByRole("dialog").getByText("Next turn")).toBeVisible();
  await page.getByTestId("seat-Kim").click();
  await page.getByTestId("seat-save").click();
  await expect(page.getByText("Bao Tran → Kim")).toBeVisible();
  await expect(page.locator('[data-testid="cal-block"][data-name="Bao Tran"]')).toHaveCount(1);
  await expect(page.getByTestId("wait-pill")).toContainText("0 waiting");

  // Second walk-in walks out.
  await add("Vy Ho");
  await page.getByTestId("wait-pill").click();
  await page.getByRole("dialog").getByTestId("walked-out").click();
  await expect(page.getByText(/Vy Ho walked out after \d+ min/)).toBeVisible();
  await expect(page.getByTestId("wait-pill")).toContainText("0 waiting");

  // Bao's ticket is open at checkout with Kim.
  await page.goto("/checkout");
  await expect(page.getByText("Bao Tran").first()).toBeVisible();
  expect(errors).toEqual([]);
});
