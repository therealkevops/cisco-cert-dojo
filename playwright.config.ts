import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the production build (`npm run build` first).
// Locally they reuse a server already running on port 3123.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:3123", trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: "npm run start -- -p 3123", url: "http://localhost:3123", reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
