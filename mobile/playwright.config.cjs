const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests/e2e", timeout: 90_000, workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173", headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    screenshot: "only-on-failure", trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/e2e/serve.cjs", url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
