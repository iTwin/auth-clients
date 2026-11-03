/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ElectronApplication, Page } from "@playwright/test";
import { _electron as electron, expect, test } from "@playwright/test";
import type { SignInOptions } from "./types.js";
import { loadConfig } from "./helpers/loadConfig.js";
import { TestHelper } from "./helpers/TestHelper.js";
import { RefreshTokenStore } from "../main/TokenStore.js";
import { getPrefixedClientId } from "../common/IpcChannelNames.js";
import { redirectUri } from "./redirectUri.js";

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
    case "win32": { // For Windows
      const appData = process.env.APPDATA;
      if (!appData)
        throw new Error("APPDATA environment variable not set on Windows");
      return `${appData}/Electron`;
    }
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

declare global {
  var capturedSignInUrls: string[] | undefined;
}

/**
 * Replaces `shell.openExternal` in the main process so that sign in URLs are recorded
 * instead of opening a real browser. This must complete before anything triggers a sign
 * in, otherwise the URL can be opened before the override is installed and would never
 * be captured.
 */
async function captureSignInUrls(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ shell }) => {
    globalThis.capturedSignInUrls = [];
    shell.openExternal = async (url: string) => {
      globalThis.capturedSignInUrls?.push(url);
    };
  });
}

/** Waits for the next URL recorded by {@link captureSignInUrls} and consumes it. */
async function waitForSignInUrl(app: ElectronApplication, timeoutMs = 15000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const url = await app.evaluate(async () => globalThis.capturedSignInUrls?.shift());
    if (undefined !== url)
      return url;
    if (Date.now() >= deadline) {
      const appError = await electronPage.locator("#error").textContent();
      const cause = appError
        ? `The app reported: ${appError}`
        : "The app may have signed in silently using a cached token, or never attempted to sign in at all.";
      throw new Error(`Timed out waiting for the app to open an external sign in URL. ${cause}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Resolves once nothing is listening on the sign in redirect port used by the test app. */
async function waitForRedirectPortRelease(timeoutMs = 10000): Promise<void> {
  const { connect } = await import("node:net");
  const port = Number(new URL(redirectUri).port);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const inUse = await new Promise<boolean>((resolve) => {
      const socket = connect({ port, host: "127.0.0.1" })
        .on("connect", () => {
          socket.destroy();
          resolve(true);
        })
        .on("error", () => resolve(false));
    });
    if (!inUse)
      return;
    if (Date.now() >= deadline)
      throw new Error(`Port ${port} is still in use, the next sign in attempt would fail to bind it.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test.beforeEach(async () => {
  await Promise.all(tokenStores.map(async (store) => store.delete()));
  electronApp = await electron.launch({
    args: ["./dist/integration-test/test-app/index.js"],
  });
  electronPage = await electronApp.firstWindow();
  await captureSignInUrls(electronApp);

  // The app must start signed out. If a refresh token survives the deletion above, the
  // app signs in silently and never opens an external URL, which makes every sign in
  // based test below hang instead of reporting the leaked credentials.
  await testHelper.checkStatus(electronPage, false);
  await testHelper.checkOtherStatus(electronPage, false);
});

test.afterEach(async () => {
  await electronApp.close();
  // The app binds a fixed port for the sign in redirect URI. Playwright resolves close()
  // before the OS has released the listening socket, so the next app can fail to bind it
  // and never gets as far as opening a sign in URL.
  await waitForRedirectPortRelease();
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
  await testHelper.signIn(page, await waitForSignInUrl(electronApp));
  await testHelper.checkStatus(electronPage, true);
  await page.close();
});

test("sign out successful", async ({ browser }) => {
  const page = await browser.newPage();
  await testHelper.clickSignIn(electronPage);
  await testHelper.signIn(page, await waitForSignInUrl(electronApp));
  await testHelper.checkStatus(electronPage, true);
  await testHelper.clickSignOut(electronPage);
  await testHelper.checkStatus(electronPage, false);
  await page.close();
});

// FIXME: this test has never verified anything. It "cheats" by calling
// `tokenStores[0].load()` with changed scopes, but `load` is a pure read: on a scope
// mismatch it returns undefined and leaves the store untouched, so it cannot sign the
// app out, and `isAuthorized` reflects the live in-memory token regardless. The status
// check below used to assert nothing, which hid the failure. Verifying this properly
// requires relaunching the app with different scopes.
test.fixme("when scopes change, sign in is required", async ({ browser }) => {
  const page = await browser.newPage();
  await testHelper.clickSignIn(electronPage);
  await testHelper.signIn(page, await waitForSignInUrl(electronApp));
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
  await testHelper.signIn(page, await waitForSignInUrl(electronApp));
  await page.close();

  // only the default auth client should be signed in
  await testHelper.checkStatus(electronPage, true);
  await testHelper.checkOtherStatus(electronPage, false);

  // Now sign in with the other auth client
  const otherPage = await browser.newPage();
  await testHelper.clickOtherSignIn(electronPage);
  await testHelper.signIn(otherPage, await waitForSignInUrl(electronApp));
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
