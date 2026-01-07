/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ElectronApplication, Page } from "@playwright/test";
import { _electron as electron, expect, test } from "@playwright/test";
import type { SignInOptions } from "./types";
import { loadConfig } from "./helpers/loadConfig";
import { TestHelper } from "./helpers/TestHelper";
import { RefreshTokenStore } from "../main/TokenStore";
import { getPrefixedClientId } from "../common/IpcChannelNames";

const { clientId, envPrefix, email, password } = loadConfig();

const signInOptions: SignInOptions = {
  clientId,
  email,
  password,
  envPrefix,
};

// Get the user data path that would be returned in app.getPath('userData') if ran in main electron process.
const getElectronUserDataPath = (): string | undefined => {
  switch (process.platform) {
    case "darwin": // For MacOS
      return `${process.env.HOME}/Library/Application Support/Electron`;
    case "win32": // For Windows
      return `${process.env.APPDATA!}/Electron`;
    case "linux": // For Linux
      return undefined; // Linux uses the same path for both main and renderer processes, no need to manually resolve path.
    default:
      return process.cwd();
  }
};

const userDataPath = getElectronUserDataPath();
let electronApp: ElectronApplication;
let electronPage: Page;
const testHelper = new TestHelper(signInOptions);
const tokenStores = [
  new RefreshTokenStore(getTokenStoreFileName(), getTokenStoreKey(), userDataPath),
  new RefreshTokenStore(
    getTokenStoreFileName("prefixed"),
    getTokenStoreKey(undefined, "prefixed"),
    userDataPath,
  ),
];

function getTokenStoreKey(issuerUrl?: string, channelClientPrefix?: string): string {
  const authority = new URL(issuerUrl ?? "https://ims.bentley.com");
  if (envPrefix && !issuerUrl) {
    authority.hostname = envPrefix + authority.hostname;
  }
  issuerUrl = authority.href.replace(/\/$/, "");
  return `${getTokenStoreFileName(channelClientPrefix)}:${issuerUrl}`;
}

function getTokenStoreFileName(channelClientPrefix?: string): string {
  const clientIdWithPrefix = getPrefixedClientId(clientId, channelClientPrefix);
  return `iTwinJs_${clientIdWithPrefix}`;
}

async function getUrl(app: ElectronApplication): Promise<string> {
  // evaluates in the context of the main process
  // TODO: consider writing a helper to make this easier
  return app.evaluate<string>(async ({ shell }) => {
    return new Promise((resolve) => {
      shell.openExternal = async (url: string) => {
        return resolve(url);
      };
    });
  });
}

test.beforeEach(async () => {
  try {
    await Promise.all(tokenStores.map(async (store) => store.delete()));
    electronApp = await electron.launch({
      args: ["./dist/integration-test/test-app/index.js"],
    });
    electronPage = await electronApp.firstWindow();
  } catch (error) {
  }
});

test.afterEach(async () => {
  await electronApp.close();
});

test("buttons exist", async () => {
  const signInButton = electronPage.getByTestId("signIn");
  const signOutButton = electronPage.getByTestId("signOut");
  const getStatusButton = electronPage.getByTestId("getStatus");
  await expect(signInButton).toBeVisible();
  await expect(signOutButton).toBeVisible();
  await expect(getStatusButton).toBeVisible();
});

test("sign in successful", async ({ browser }) => {
  const page = await browser.newPage();
  await testHelper.checkStatus(electronPage, false);
  await testHelper.clickSignIn(electronPage);
  const url = await getUrl(electronApp);
  await testHelper.signIn(page, url);
  await testHelper.checkStatus(electronPage, true);
  await page.close();
});

test("sign out successful", async ({ browser }) => {
  const page = await browser.newPage();
  await testHelper.clickSignIn(electronPage);
  await testHelper.signIn(page, await getUrl(electronApp));
  await testHelper.checkStatus(electronPage, true);
  await testHelper.clickSignOut(electronPage);
  await testHelper.checkStatus(electronPage, false);
  await page.close();
});

test("when scopes change, sign in is required", async ({ browser }) => {
  const page = await browser.newPage();
  await testHelper.clickSignIn(electronPage);
  await testHelper.signIn(page, await getUrl(electronApp));
  await testHelper.checkStatus(electronPage, true);

  // Admittedly this is cheating: no user would interact
  // with the tokenStore directly, but this is a tough
  // case to test otherwise.
  await tokenStores[0].load("itwin-platform realitydata:read");
  await testHelper.checkStatus(electronPage, false);
});

test("handles multiple instances with different channelClientPrefix", async ({
  browser,
}) => {
  // Sign in with the default auth client
  const page = await browser.newPage();
  await testHelper.checkStatus(electronPage, false);
  await testHelper.checkOtherStatus(electronPage, false);

  await testHelper.clickSignIn(electronPage);
  const url = await getUrl(electronApp);
  await testHelper.signIn(page, url);
  await page.close();

  // only the default auth client should be signed in
  await testHelper.checkStatus(electronPage, true);
  await testHelper.checkOtherStatus(electronPage, false);

  // Now sign in with the other auth client
  const otherPage = await browser.newPage();
  await testHelper.clickOtherSignIn(electronPage);
  const otherUrl = await getUrl(electronApp);
  await testHelper.signIn(otherPage, otherUrl);
  await otherPage.close();

  // both auth clients should be signed in
  await testHelper.checkOtherStatus(electronPage, true);
  await testHelper.checkStatus(electronPage, true);

  // sign out the default auth client
  await testHelper.clickSignOut(electronPage);

  // the other auth client should still be signed in
  await testHelper.checkStatus(electronPage, false);
  await testHelper.checkOtherStatus(electronPage, true);
});
