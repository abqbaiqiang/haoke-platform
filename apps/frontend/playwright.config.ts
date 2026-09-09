import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", timeout: 30000, workers: 1, retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: process.env.E2E_BASE_URL || "http://localhost:3000", trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.E2E_BROWSER_CHANNEL || "chromium" } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: process.env.E2E_BROWSER_CHANNEL || "chromium" } },
  ],
});
