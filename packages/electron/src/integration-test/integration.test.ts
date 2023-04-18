import { ElectronApplication, Browser, BrowserContext, Page, expect, test } from "@playwright/test";
import {
  clickMenuItemById,
  findLatestBuild,
  ipcMainCallFirstListener,
  ipcRendererCallFirstListener,
  parseElectronApp,
  ipcMainInvokeHandler,
  ipcRendererInvoke
} from 'electron-playwright-helpers'
import { SignInOptions } from "./types";
import { loadConfig } from "./helpers/loadConfig";

const { _electron: electron, chromium } = require('playwright');
const { url, clientId, envPrefix, email, password } = loadConfig();
const http = require("http");

const signInOptions: SignInOptions = {
  email,
  password,
  url,
  clientId,
  envPrefix: envPrefix || "",
};

let electronApp: ElectronApplication;
let windows: Page[];

test.beforeAll(async () => {
  electronApp = await electron.launch({

    args: ['./dist/integration-test/test-app/index.js'],
    env: {
      ...process.env
    }
  });
  page = await electronApp.firstWindow();
  windows = electronApp.windows();
  console.log("len of windows: " + windows.length);

  electronApp.on('window', async (page) => {
    const filename = page.url()?.split('/').pop()
    console.log(`Window opened: ${filename}`)

    // // capture errors
    // page.on('pageerror', (error) => {
    //   console.error(error)
    // })
    // // capture console messages
    // page.on('console', (msg) => {
    //   console.log(msg.text())
    // })
  });

});

// (async () => {
//   // Launch Electron app.

//   // Evaluation expression in the Electron context.
//   const appPath: string = await electronApp.evaluate(async ({ app }) => {
//     // This runs in the main Electron process, parameter here is always
//     // the result of the require('electron') in the main app script.
//     return app.getAppPath();
//   });
//   console.log(appPath);

//   // Get the first window that the app opens, wait if necessary.
//   const window = await electronApp.firstWindow();
//   // Print the title.
//   console.log(await window.title());
//   // // Capture a screenshot.
//   // await window.screenshot({
//   //   animations: "allow",
//   //   path: './src/integration-test/intro.png'
//   // });
//   // Direct Electron console to Node terminal.
//   window.on('console', console.log);
//   // Click button.
//   await window.click('text=Sign In');
// })();

test.afterAll(async () => {
  // Exit app.
  console.log(`on closing: ${electronApp.context().pages().length}`);
  await electronApp.close();
  console.log(`after closing: ${electronApp.context().pages().length}`);
});

let page: Page;

test('use context 1', async () => {
  const [browserContext] = await Promise.all([
    page.context(),
    await page.getByTestId('signIn').click(),
  ])
  const newPage = await browserContext.newPage();
  await newPage.waitForLoadState('domcontentloaded');
  const url = newPage.url();
  console.log(page.url());
  expect(url).toBe("not blah");
})


test('evaluate expression', async () => {
  // Evaluation expression in the Electron context.
  const appPath: string = await electronApp.evaluate(async ({ app }) => {
    // This runs in the main Electron process, parameter here is always
    // the result of the require('electron') in the main app script.
    return app.getAppPath();
  });
  console.log("appPath: " + appPath);
});

test('buttons exist', async () => {
  page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('signIn')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('signOut')).toBeVisible({ timeout: 5000 });
});

test.skip('sign in successful', async () => {
  const browser = await chromium.launch({
    args: ["--remote-debugging-port=9222"],
    headless: false,
  });
  const browserPage = await browser.newPage();
  await browserPage.waitForLoadState();

  await page.getByTestId('signOut').click();
  page.getByTestId('signIn').click()
    .then(() => {
      console.log("sign in successful");
      (async () => {
        console.log('opening browser to sign in')
        await browserPage.goto('https://qa-ims.bentley.com/connect/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fsignin-callback&client_id=native-HbVraCtzD89drwApATvToUKpj&response_type=code&state=WvpBxENQvx&scope=users%3Aread%20itwins%3Amodify%20projects%3Amodify%20itwins%3Aread%20projects%3Aread%20offline_access&code_challenge=LWubReUkDTHud__oglLbMOJHqFshCfwG10yFVDiRhPc&code_challenge_method=S256');
        expect(0).toBe(1);
        await browserPage.getByLabel('Email address').click();
        await browserPage.getByLabel('Email address').fill(process.env.IMJS_TEST_REGULAR_USER_NAME);
        await browserPage.getByText('Next').click();
        await browserPage.getByLabel('Password').click();
        await browserPage.getByLabel('Password').fill(process.env.IMJS_TEST_REGULAR_USER_PASSWORD);
        await browserPage.getByText('Sign In').click();
        await browserPage.getByRole('link', { name: 'Accept' }).click();
        expect(browserPage.getByRole('h1', { name: 'Sign in was successful!' }));
        expect(1).toBe(0);
      })();
    })
    .catch((err) => {
      console.log("sign in unsuccessful: " + err);
    });

  await page.getByTestId('signOut').click();
});

test('sign out error', async () => {
  await page.getByTestId('signOut').click();
  await page.getByTestId('signOut').click();
  await page.getByTestId('signOut').click();
  await page.getByTestId('signOut').click();
  await page.getByTestId('signOut').click();
  page.on('pageerror', (error) => {
    console.error(error);
    expect(error).toContain("Error invoking remote method");
  })

  // capture errors
  page.on('pageerror', (error) => {
    console.error("err'r'rr'r'r'", error)
  })
  // capture console messages
  page.on('console', (msg) => {
    console.log("msgggg", msg.text())
  })

  console.log("after")
});

test('mock shell.openExternal', async () => {
  // Evaluation expression in the Electron context.
  await page.getByTestId('signOut').click();

  let authUrl = 'https://qa-ims.bentley.com/connect/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fsignin-callback&client_id=native-HbVraCtzD89drwApATvToUKpj&response_type=code&state=WvpBxENQvx&scope=users%3Aread%20itwins%3Amodify%20projects%3Amodify%20itwins%3Aread%20projects%3Aread%20offline_access&code_challenge=LWubReUkDTHud__oglLbMOJHqFshCfwG10yFVDiRhPc&code_challenge_method=S256'
  const appPath: string = await electronApp.evaluate(async ({ app }) => {
    return app.getAppPath();
  });
  console.log("appPath: " + appPath);
  await page.getByTestId('signIn').click();
  await page.waitForTimeout(10000);
  const appPath2: string = await electronApp.evaluate(async ({ app }) => {
    // This runs in the main Electron process, parameter here is always
    // the result of the require('electron') in the main app script.
    return app.getAppPath();
  });
  console.log("appPath2: " + appPath2);
  await page.waitForTimeout(10000);
});