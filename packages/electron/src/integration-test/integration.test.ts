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

const { clientId, envPrefix, email, password } = loadConfig();

const signInOptions: SignInOptions = {
  clientId,
  email,
  password,
  envPrefix,
};

let electronApp: ElectronApplication;
let electronPage: Page;
const testHelper = new TestHelper(signInOptions);
const tokenStore = new RefreshTokenStore(getTokenStoreFileName(clientId),getTokenStoreKey(clientId));

function getTokenStoreKey(_clientId: string, issuerUrl?: string): string {
  const authority = new URL(issuerUrl ?? "https://ims.bentley.com");
  if (envPrefix && !issuerUrl) {
    authority.hostname = envPrefix + authority.hostname;
  }
  issuerUrl = authority.href.replace(/\/$/, "");
  return `${getTokenStoreFileName(_clientId)}:${issuerUrl}`;
}

function getTokenStoreFileName(_clientId: string): string {
  return `iTwinJs_${_clientId}`;
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
    await tokenStore.delete();
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
  await electronPage.waitForLoadState("domcontentloaded");
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
  await testHelper.signIn(page, await getUrl(electronApp));
  await page.waitForLoadState("networkidle");
  await testHelper.checkStatus(electronPage, true);
  await page.close();
});

test("sign out successful", async ({ browser }) => {
  const page = await browser.newPage();
  await testHelper.clickSignIn(electronPage);
  await testHelper.signIn(page, await getUrl(electronApp));
  await page.waitForLoadState("networkidle");
  await testHelper.checkStatus(electronPage, true);
  await testHelper.clickSignOut(electronPage);
  await page.waitForLoadState("networkidle");
  await testHelper.checkStatus(electronPage, false);
  await page.close();
});
