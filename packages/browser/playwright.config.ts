import { defineConfig } from "@playwright/test";

// playwright types here are... not cooperating
const reporter: any = process.env.AGENT_ID
  ? [
    ["junit", { outputFile: "junit_results.xml" }],
    ["dot", []],
  ]
  : "list";

export default defineConfig({
  reporter,
  workers: 1,
  webServer: {
    command: "npm run test:integration:start-test-app",
    url: "http://localhost:1234",
  },
  retries: 0,
  repeatEach: 0,
  projects: [
    {
      timeout: 20000,
      name: "chrome",
      use: {
        screenshot: "only-on-failure",
        headless: true,
      },
      retries: 0,
      repeatEach: 0,
    }
  ]

});
