import { defineConfig } from "@playwright/test";

// playwright types here are... not cooperating
const reporter: any = process.env.AGENT_ID
  ? [
      ["junit", { outputFile: "junit_results.xml" }],
      ["dot", []],
    ]
  : "list";

export default defineConfig({
  timeout: 60000,
  reporter,
  use: {
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
