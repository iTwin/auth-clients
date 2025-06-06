import { test as base } from "@playwright/test";
import { BrowserAppFixture } from "./BrowserAppFixture";
import { loadConfig } from "../helpers/loadConfig";

const { url, clientId, envPrefix, email, password } = loadConfig();

const signInOptions = {
  email,
  password,
  url,
  clientId,
  envPrefix: envPrefix || "",
};

export const test = base.extend<{ app: BrowserAppFixture }>({
  app: async ({ page }, use) => {
    const testHelper = new BrowserAppFixture(page, signInOptions);
    await use(testHelper);
  },
});

export { expect } from "@playwright/test";

