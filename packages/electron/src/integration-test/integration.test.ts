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

test.only('buttons exist', async () => {
  electronPage.waitForLoadState('domcontentloaded')
  const signInButton = electronPage.getByTestId('signIn')
  const signOutButton = electronPage.getByTestId('signOut')
  await expect(signInButton).toBeVisible();
  await expect(signOutButton).toBeVisible();
  signInButton.click();
});

test('sign in successful', async () => {
  const urlWhenClicked = electronApp.evaluate<string>(
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
  const url = await urlWhenClicked;
  console.log(url);
  const browser = await chromium.launch({
    headless: false
  });
  const browserPage = await browser.newPage();
  expect(url).toBeTruthy();
  testHelper.signIn(browserPage, url);
  await browserPage.waitForURL(url);
  await expect(browserPage.getByRole('heading', { name: 'Sign in was successful!' })).toBeVisible();
  await browserPage.close();
});

test('sign out successful', async () => {
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
  await electronPage.getByTestId('signIn').click({
    clickCount: 10
  });
  console.log('url1: ', urlWhenClicked);
  const browser = await chromium.launch({
    headless: false
  });
  const browserPage = await browser.newPage();
  expect(urlWhenClicked).toBeTruthy();
  testHelper.signIn(browserPage, urlWhenClicked);
  await browserPage.waitForURL(urlWhenClicked);
  await expect(browserPage.getByRole('heading', { name: 'Sign in was successful!' })).toBeVisible();
  await browserPage.close();

  const urlWhenClicked2 = await electronApp.evaluate<string>(
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
  const browserPage2 = await browser.newPage();
  await electronPage.getByTestId('signOut').click({
    clickCount: 10
  });
  console.log('url2: ', urlWhenClicked2);
  await browserPage2.waitForURL(urlWhenClicked2);
  // await browserPage2.goto(urlWhenClicked2);
  await expect(browserPage2.getByText('Sign Off Successful')).toBeVisible();
  await browserPage2.close();
})
