import { defineConfig } from "@playwright/test";

// Playwright types are not flexible enough, apparently
const reporter: any = process.env.AGENT_ID
  ? [["junit", { outputFile: "junit_results.xml" }]]
  : "list";

export default defineConfig({
  timeout: 30000,
  webServer: {
    command: "npm run test:integration:start-test-app",
    url: "http://localhost:1234",
  },
  reporter,
  use: {
    screenshot: "only-on-failure",
    video: "on",
  },
});
