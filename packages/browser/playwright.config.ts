import { defineConfig } from "@playwright/test";
export default defineConfig({
  timeout: 30000,
  webServer: {
    command: "npm run test-integration:start-test-app",
    url: "http://localhost:1234",
  },
});
