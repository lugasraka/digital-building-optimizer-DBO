import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 120_000,
  // PLAYWRIGHT_EXPECT_TIMEOUT overrides the assertion timeout (e.g. for live-API runs).
  expect: { timeout: Number(process.env.PLAYWRIGHT_EXPECT_TIMEOUT ?? 20_000) },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_BASE: "http://localhost:8000",
      // Set PLAYWRIGHT_USE_MOCKS=0 to run the happy path against a live backend.
      NEXT_PUBLIC_USE_MOCKS: process.env.PLAYWRIGHT_USE_MOCKS ?? "1",
    },
  },
});
