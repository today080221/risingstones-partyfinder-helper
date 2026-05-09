import { defineConfig, devices } from "@playwright/test";

process.env.PLAYWRIGHT_SKIP_BROWSER_GC ??= "1";

const browserChannel =
  process.env.PLAYWRIGHT_CHANNEL === "bundled"
    ? ""
    : process.env.PLAYWRIGHT_CHANNEL || "";
const e2ePort = process.env.PLAYWRIGHT_PORT || "5187";
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(browserChannel ? { channel: browserChannel } : {})
  },
  webServer: {
    command: `npm run dev:web:e2e -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 900 }
      }
    }
  ]
});
