import { expect, test } from "@playwright/test";

// Inside the iPhone app (faked here): Apple's rules say the pay tile is called "Tap to Pay on iPhone" and shows
// Apple's own symbol, which the app hands over as a picture. Test copy = payments off, so the tile is shown but greyed.
const SYMBOL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 PolishOSApp/1.3 PolishOS-iOS" });

test("iPhone app: pay tile says Tap to Pay on iPhone with Apple's symbol", async ({ page }) => {
  await page.addInitScript((icon) => {
    const app = {
      onmessage: null as null | ((e: { data: string }) => void),
      postMessage(s: string) {
        const m = JSON.parse(s);
        const answer = m.reader === "tapCheck" ? { supported: true, ios: true, icon } : {};
        setTimeout(() => app.onmessage?.({ data: JSON.stringify({ id: m.id, ok: true, ...answer }) }), 0);
      },
    };
    (window as unknown as { PolishOSApp: typeof app }).PolishOSApp = app;
  }, SYMBOL);
  await page.goto("/checkout");
  await page.getByTestId("new-ticket").click();
  await page.getByTestId("add-service").click();
  await page.getByLabel("Search services").fill("gel color man");
  await page.getByRole("button", { name: /Gel color manicure/ }).click();
  await page.getByTestId("pick-Kim").click();
  await page.getByTestId("charge").click();

  const tile = page.getByTestId("pay-tap");
  await expect(tile).toContainText("Tap to Pay on iPhone");
  await expect(tile).toContainText("top of this iPhone");
  await expect(tile.getByTestId("tap-symbol")).toHaveAttribute("src", SYMBOL);
  await expect(tile).not.toContainText("Tap card on this phone");
});

test("Settings → Tap to Pay on iPhone: owner turns it on for this iPhone, then can turn it off", async ({ page }) => {
  await page.addInitScript((icon) => {
    const app = {
      onmessage: null as null | ((e: { data: string }) => void),
      postMessage(s: string) {
        const m = JSON.parse(s);
        const answer = m.reader === "tapCheck" ? { supported: true, ios: true, icon } : {};
        setTimeout(() => app.onmessage?.({ data: JSON.stringify({ id: m.id, ok: true, ...answer }) }), 0);
      },
    };
    (window as unknown as { PolishOSApp: typeof app }).PolishOSApp = app;
  }, SYMBOL);
  await page.goto("/settings/tap-to-pay");
  await expect(page.getByTestId("tap-state")).toHaveText("Off");
  await expect(page.getByText("Apple shows its terms one time")).toBeVisible();
  await page.getByTestId("tap-turn-on").click();
  await expect(page.getByTestId("tap-state")).toContainText("On");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("tap-turn-off").click();
  await expect(page.getByTestId("tap-state")).toHaveText("Off");
});

test("iPhone app: an owner sees the Tap to Pay on iPhone sheet once (Not now = gone for good)", async ({ page }) => {
  await page.addInitScript((icon) => {
    const app = {
      onmessage: null as null | ((e: { data: string }) => void),
      postMessage(s: string) {
        const m = JSON.parse(s);
        const answer = m.reader === "tapCheck" ? { supported: true, ios: true, icon } : {};
        setTimeout(() => app.onmessage?.({ data: JSON.stringify({ id: m.id, ok: true, ...answer }) }), 0);
      },
    };
    (window as unknown as { PolishOSApp: typeof app }).PolishOSApp = app;
    localStorage.setItem("nailpos.acting", JSON.stringify({ membership_id: "m1", name: "Lan", role: "owner", at: Date.now() }));
  }, SYMBOL);
  await page.goto("/checkout");
  const sheet = page.getByTestId("tap-intro");
  await expect(sheet).toContainText("Take cards on this iPhone");
  await page.getByTestId("tap-intro-later").click();
  await expect(sheet).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("new-ticket")).toBeVisible();
  await expect(page.getByTestId("tap-intro")).toHaveCount(0);
});

test("iPhone app: front desk staff never see the turn-on sheet", async ({ page }) => {
  await page.addInitScript(() => {
    const app = {
      onmessage: null as null | ((e: { data: string }) => void),
      postMessage(s: string) {
        const m = JSON.parse(s);
        setTimeout(() => app.onmessage?.({ data: JSON.stringify({ id: m.id, ok: true, ...(m.reader === "tapCheck" ? { supported: true, ios: true } : {}) }) }), 0);
      },
    };
    (window as unknown as { PolishOSApp: typeof app }).PolishOSApp = app;
  });
  await page.goto("/checkout");
  await expect(page.getByTestId("new-ticket")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("tap-intro")).toHaveCount(0);
});
