import { expect, test } from "@playwright/test";

// Walk-ins + turns (test copy): desk adds a walk-in → waits on the waitlist (not on the grid); seat with a tech
// (turn order shown as facts) → moves into that tech's column + an open ticket; another walks out → recorded.
test("walk-in waitlist: add, seat with a tech, walked out", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const phone = test.info().project.name === "phone";
  await page.goto("/calendar");
  // Desktop: waitlist on the left (Booking board Cal). Phone: behind the "waiting" pill.
  const list = async () => {
    if (!phone) return page.getByTestId("waitlist");
    await page.getByTestId("wait-pill").click();
    return page.getByRole("dialog").getByTestId("waitlist");
  };
  const count = phone ? page.getByTestId("wait-pill") : page.getByTestId("wait-count");
  await expect(count).toContainText("0 waiting");

  const add = async (name: string) => {
    await (await list()).getByTestId("walkin-new").click();
    await page.getByTestId("walkin-name").fill(name);
    await page.getByTestId("walkin-svc").first().click();
    await page.getByTestId("walkin-save").click();
  };
  await add("Bao Tran");
  await expect(count).toContainText("1 waiting");
  await expect(page.locator('[data-testid="cal-block"][data-name="Bao Tran"]')).toHaveCount(0);   // waiting = not on the grid

  // Seat Bao with Kim: turn order is shown, one is marked Next turn.
  const card = (await list()).getByTestId("wait-card").filter({ hasText: "Bao Tran" });
  await expect(card).toContainText("B1");
  await card.click();
  await expect(page.getByRole("dialog").getByText("Next turn")).toBeVisible();
  await page.getByTestId("seat-Kim").click();
  await page.getByTestId("seat-save").click();
  await expect(page.getByText("Bao Tran → Kim")).toBeVisible();
  await expect(page.locator('[data-testid="cal-block"][data-name="Bao Tran"]')).toHaveCount(1);
  await expect(count).toContainText("0 waiting");

  // Second walk-in walks out.
  await add("Vy Ho");
  await (await list()).getByTestId("wait-card").filter({ hasText: "Vy Ho" }).click();
  await page.getByTestId("walked-out").click();
  await expect(page.getByText(/Vy Ho walked out after \d+ min/)).toBeVisible();
  await expect(count).toContainText("0 waiting");

  // Bao's ticket is open at checkout with Kim.
  await page.goto("/checkout");
  await expect(page.getByText("Bao Tran").first()).toBeVisible();
  expect(errors).toEqual([]);
});
