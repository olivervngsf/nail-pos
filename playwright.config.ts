import { defineConfig, devices } from "@playwright/test";

// Screen tests run against the production build: `npm run build` first (CI does), then `npm run e2e`.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  // Reduced motion = no leaving copies of closed pop-ups, so tests never see two of one thing. e2e/motion.spec.ts turns motion on.
  use: { baseURL: "http://localhost:3100", trace: "off", reducedMotion: "reduce" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "npx next start -p 3100", url: "http://localhost:3100", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
