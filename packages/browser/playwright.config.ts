import { defineConfig } from "@playwright/test";

// playwright types here are... not cooperating
const reporter: any = process.env.AGENT_ID
  ? [
    ["junit", { outputFile: "junit_results.xml" }],
    ["dot", []],
  ]
  : "list";

export default defineConfig({
  timeout: 10000,
  reporter,
  webServer: {
    command: "npm run test:integration:start-test-app",
    url: "http://localhost:5173",
  },
  use: {
    screenshot: "only-on-failure",
    headless: true
  },
});
