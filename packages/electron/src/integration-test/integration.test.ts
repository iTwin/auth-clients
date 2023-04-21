import { ElectronApplication, Page, expect, test } from "@playwright/test";
import { SignInOptions } from "./types";
import { loadConfig } from "./helpers/loadConfig";
import { TestHelper } from "./helpers/TestHelper";
import { _electron as electron, chromium } from 'playwright';

const { clientId, envPrefix, email, password } = loadConfig();

const signInOptions: SignInOptions = {
  clientId,
  email,
  password,
  envPrefix: envPrefix || "",
};

let electronApp: ElectronApplication;
let electronPage: Page;
const testHelper = new TestHelper(signInOptions);

test.beforeAll(async () => {
  try {
    electronApp = await electron.launch({
      args: ["./dist/integration-test/test-app/index.js"],
    });
    electronPage = await electronApp.firstWindow();
  } catch (error) {
    console.log(error);
  }
});

test.afterAll(async () => {
  // Exit app.
  await electronApp.close();
});

test('buttons exist', async () => {
  electronPage.waitForLoadState('domcontentloaded');
  const signInButton = electronPage.getByTestId('signIn');
  const signOutButton = electronPage.getByTestId('signOut');
  await expect(signInButton).toBeVisible();
  await expect(signOutButton).toBeVisible();
});

test('sign in successful', async ({ browser }) => {
  const urlWhenClicked = electronApp.evaluate<string>(async ({ shell }) => {
    return new Promise((resolve) => {
      shell.openExternal = async (url: string) => {
        return resolve(url);
      };
    });
    // This runs in the main Electron process, parameter here is always
    // the result of the require('electron') in the main app script.
  });

  const page = await browser.newPage();
  await testHelper.clickSignIn(electronPage);
  await testHelper.signIn(page, await urlWhenClicked);
  await page.waitForTimeout(1000);
  page.close();
});
