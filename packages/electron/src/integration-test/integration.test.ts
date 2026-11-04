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
import { join } from "node:path";

const { clientId, envPrefix, email, password } = loadConfig();

const signInOptions: SignInOptions = {
  clientId,
  email,
  password,
  envPrefix,
};

// Get the user data path that would be returned in app.getPath('userData') if ran in main electron process.
const getElectronUserDataPath = (): string => {
  const fromEnv = (variable: string): string => {
    const value = process.env[variable];
    if (!value)
      throw new Error(`${variable} environment variable not set on ${process.platform}`);
    return value;
  };

  switch (process.platform) {
    case "darwin": // For MacOS
      return join(fromEnv("HOME"), "Library", "Application Support", "Electron");
    case "win32": // For Windows
      return join(fromEnv("APPDATA"), "Electron");
    case "linux": // For Linux
      return join(process.env.XDG_CONFIG_HOME ?? join(fromEnv("HOME"), ".config"), "Electron");
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

/** Host of the identity provider the test app signs in against. */
function getIssuerHostname(): string {
  const authority = new URL("https://ims.bentley.com");
  if (envPrefix)
    authority.hostname = envPrefix + authority.hostname;
  return authority.hostname;
}

function getTokenStoreFileName(channelClientPrefix?: string): string {
  const clientIdWithPrefix = getPrefixedClientId(clientId, channelClientPrefix);
  return `iTwinJs_${clientIdWithPrefix}`;
}

declare global {
  var capturedExternalUrls: string[] | undefined;
}

type ExternalUrlKind = "signIn" | "signOut";

/**
 * Replaces `shell.openExternal` in the main process so that the URLs the app would open
 * in a real browser are recorded instead. This must complete before anything triggers a
 * sign in, otherwise the URL can be opened before the override is installed and would
 * never be captured.
 */
async function captureExternalUrls(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ shell }) => {
    globalThis.capturedExternalUrls = [];
    shell.openExternal = async (url: string) => {
      globalThis.capturedExternalUrls?.push(url);
    };
  });
}

/**
 * Consumes the first captured URL of the given kind, leaving the rest in place. Signing
 * in and signing out both go through `shell.openExternal`, so taking URLs in arrival
 * order would let a leftover end session URL be mistaken for a sign in URL.
 */
async function takeExternalUrl(
  app: ElectronApplication,
  kind: ExternalUrlKind,
): Promise<string | undefined> {
  return app.evaluate(async (_electron, requestedKind) => {
    const urls = globalThis.capturedExternalUrls ?? [];
    // Only an authorization request carries a response_type, the end session endpoint is opened bare.
    const index = urls.findIndex((url) => {
      const isSignIn = new URL(url).searchParams.has("response_type");
      return "signIn" === requestedKind ? isSignIn : !isSignIn;
    });
    return 0 > index ? undefined : urls.splice(index, 1)[0];
  }, kind);
}

/** Waits for a URL recorded by {@link captureExternalUrls} and consumes it. */
async function waitForExternalUrl(
  app: ElectronApplication,
  kind: ExternalUrlKind,
  timeoutMs = 10000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const url = await takeExternalUrl(app, kind);
    if (undefined !== url)
      return url;
    if (Date.now() >= deadline) {
      // Never let a failure to read the app's error replace the timeout being reported.
      const appError = await electronPage
        .locator("#error")
        .textContent()
        .catch(() => undefined);
      const action = "signIn" === kind
        ? "open an external sign in URL"
        : "open the end session endpoint";
      const fallback = "signIn" === kind
        ? "The app may have signed in silently using a cached token, or never attempted to sign in at all."
        : "The app may not have reached the end session step of signing out.";
      const cause = appError ? `The app reported: ${appError}` : fallback;
      throw new Error(`Timed out waiting for the app to ${action}. ${cause}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function waitForSignInUrl(app: ElectronApplication): Promise<string> {
  return waitForExternalUrl(app, "signIn");
}

async function waitForSignOutUrl(app: ElectronApplication): Promise<string> {
  return waitForExternalUrl(app, "signOut");
}

/** Resolves once nothing is listening on the sign in redirect port used by the test app. */
async function waitForRedirectPortRelease(timeoutMs = 10000): Promise<void> {
  const { connect } = await import("node:net");
  const { port, hostname } = new URL(redirectUri);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // Probe the hostname the app binds rather than a fixed address: "localhost" resolves
    // to ::1 on a dual stack host, where a probe of 127.0.0.1 is refused even though the
    // previous app is still listening.
    const inUse = await new Promise<boolean>((resolve) => {
      const socket = connect({ port: Number(port), host: hostname })
        .on("connect", () => {
          socket.destroy();
          resolve(true);
        })
        .on("error", () => resolve(false));
      // A dropped SYN would otherwise leave this pending well past the deadline below.
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(true);
      });
    });
    if (!inUse)
      return;
    if (Date.now() >= deadline)
      throw new Error(`Port ${port} is still in use, the next sign in attempt would fail to bind it.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Launches the test app and makes it the one the hooks and helpers act on. `scopes`
 * overrides the scopes the app requests, everything else comes from the environment.
 */
async function launchApp(scopes?: string): Promise<void> {
  electronApp = await electron.launch({
    args: ["./dist/integration-test/test-app/index.js"],
    env: scopes ? { ...process.env, IMJS_TEST_ELECTRON_SCOPES: scopes } : undefined, // eslint-disable-line @typescript-eslint/naming-convention
  });
  electronPage = await electronApp.firstWindow();
  await captureExternalUrls(electronApp);
}

/**
 * Closes the app while leaving its refresh token on disk, then launches a fresh one, as
 * a user restarting the app would.
 */
async function relaunchApp(scopes?: string): Promise<void> {
  await electronApp.close();
  await waitForRedirectPortRelease();
  await launchApp(scopes);
}

/** A scope set the test app's stored token is guaranteed not to match. */
function getDifferentScopes(): string {
  const scopes = (process.env.IMJS_TEST_ELECTRON_SCOPES ?? "").split(" ").filter((scope) => scope && scope !== "offline_access");
  if (1 < scopes.length)
    return scopes.slice(0, -1).join(" ");
  const extraScope = ["profile", "email", "openid"].find((scope) => !scopes.includes(scope));
  return [...scopes, extraScope].join(" ");
}

test.beforeEach(async () => {
  await Promise.all(tokenStores.map(async (store) => store.delete()));
  await launchApp();

  // The deletion above is only effective if the tests write to the same place the app
  // does. When these drift a token the tests believe they removed is left behind, so the
  // next app signs in silently with its refresh token, never opens a sign in URL, and
  // the wait for that URL times out rather than failing here.
  const appUserDataPath = await electronApp.evaluate(async ({ app }) => app.getPath("userData"));
  expect(appUserDataPath).toBe(userDataPath);
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

  // Signing out must also end the session with the identity provider, not just drop the
  // local token. Nothing opens this URL, so only the request itself can be checked.
  expect(new URL(await waitForSignOutUrl(electronApp)).hostname).toBe(getIssuerHostname());

  await testHelper.checkStatus(electronPage, false);
  await page.close();
});

test("signs in silently with a token from a previous session", async ({ browser }) => {
  test.slow();
  const page = await browser.newPage();
  await testHelper.clickSignIn(electronPage);
  await testHelper.signIn(page, await waitForSignInUrl(electronApp));
  await testHelper.checkStatus(electronPage, true);
  await page.close();

  await relaunchApp();
  await testHelper.checkStatus(electronPage, false);
  await testHelper.clickSignIn(electronPage);
  await testHelper.checkStatus(electronPage, true);

  // Signing in from the stored refresh token must not involve the browser.
  expect(await takeExternalUrl(electronApp, "signIn")).toBeUndefined();
  await expect(electronPage.locator("#error")).toBeEmpty();
});

test("when scopes change, sign in is required", async ({ browser }) => {
  test.slow();
  const page = await browser.newPage();
  await testHelper.clickSignIn(electronPage);
  await testHelper.signIn(page, await waitForSignInUrl(electronApp));
  await testHelper.checkStatus(electronPage, true);
  await page.close();

  // The stored token was granted for the original scopes, so it must not be reused.
  const differentScopes = getDifferentScopes();
  await relaunchApp(differentScopes);
  await testHelper.clickSignIn(electronPage);
  const signInUrl = new URL(await waitForSignInUrl(electronApp));
  // Confirms the relaunched app really asked for the new scopes. That the same token is
  // otherwise reused is covered by the silent sign in test.
  expect(signInUrl.searchParams.get("scope")?.split(" ").sort()).toEqual(
    `${differentScopes} offline_access`.split(" ").sort(),
  );
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
