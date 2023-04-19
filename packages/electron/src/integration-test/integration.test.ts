import { ElectronApplication, Page, expect, test } from "@playwright/test";
import { SignInOptions } from "./types";
import { loadConfig } from "./helpers/loadConfig";
import { TestHelper } from "./helpers/TestHelper";
import { _electron as electron, chromium } from 'playwright';

const { envPrefix, email, password } = loadConfig();

const signInOptions: SignInOptions = {
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
  await electronApp.close();
});

test('buttons exist', async () => {
  electronPage.waitForLoadState('domcontentloaded')
  expect(electronPage.getByTestId('signIn')).toBeDefined();
  expect(electronPage.getByTestId('signOut')).toBeDefined();
});

test('sign in successful', async () => {
  const urlWhenClicked = await electronApp.evaluate<string>(
    async ({ shell }) => {
      return new Promise((resolve) => {
        shell.openExternal = async (url: string) => {
          resolve(url);
        };
      });
      // This runs in the main Electron process, parameter here is always
      // the result of the require('electron') in the main app script.
    }
  );

  electronPage.waitForLoadState();
  await electronPage.getByTestId('signIn').click();
  console.log(urlWhenClicked);
  const browser = await chromium.launch({
    headless: false
  });
  const browserPage = await browser.newPage();
  expect(urlWhenClicked).toBeTruthy();
  testHelper.signIn(browserPage, urlWhenClicked);
  await browserPage.waitForURL(urlWhenClicked);
  await expect(browserPage.getByRole('heading', { name: 'Sign in was successful!' })).toBeVisible();
  await browserPage.close();
});
