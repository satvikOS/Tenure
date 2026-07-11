import { defineConfig, devices } from "@playwright/test"

/**
 * Headless e2e suite. Runs against:
 *  - a local production build (`npm run start`) by default — CI spins up
 *    Postgres, pushes the schema, and seeds before this runs
 *  - any deployed URL via PLAYWRIGHT_BASE_URL (e.g. the CloudFront domain)
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // flows share seeded data and mutate state — run serially
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  timeout: 45_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run start",
          url: "http://localhost:3000/api/health",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
})
