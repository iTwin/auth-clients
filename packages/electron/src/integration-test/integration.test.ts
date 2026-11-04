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

// DIAG: ciphertext produced by the previous app process, so the next process can try to
// decrypt something it did not encrypt itself. This is exactly what a stored refresh
// token is on the second sign in.
let previousProbeCiphertext: string | undefined;

interface SafeStorageProbe {
  platform: string;
  backend: string;
  encryptionAvailable: boolean;
  previous?: { status: "ok" | "rejected" | "timeout"; elapsedMs: number; message?: string; roundTripMatches?: boolean };
  encrypt: { status: "ok" | "rejected" | "timeout"; elapsedMs: number; message?: string };
  ciphertext?: string;
}

/** DIAG: measures whether a fresh app can use safeStorage, and decrypt the previous app's secret. */
async function probeSafeStorage(app: ElectronApplication): Promise<SafeStorageProbe> {
  const probe = await app.evaluate(async ({ safeStorage }, previous) => {
    const race = async <T>(promise: Promise<T>, ms: number): Promise<{ status: "ok" | "rejected" | "timeout"; value?: T; message?: string; elapsedMs: number }> => {
      const started = Date.now();
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), ms); });
      try {
        const outcome = await Promise.race([promise.then((value) => ({ value })), timeout]);
        if (outcome === "timeout")
          return { status: "timeout", elapsedMs: Date.now() - started };
        return { status: "ok", value: outcome.value, elapsedMs: Date.now() - started };
      } catch (error) {
        return { status: "rejected", message: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - started };
      } finally {
        clearTimeout(timer);
      }
    };

    const result: any = {
      platform: process.platform,
      backend: process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : "n/a",
      encryptionAvailable: safeStorage.isEncryptionAvailable(), // eslint-disable-line @typescript-eslint/no-deprecated
    };

    if (previous) {
      const decrypted = await race(safeStorage.decryptStringAsync(Buffer.from(previous, "base64")), 5000);
      result.previous = {
        status: decrypted.status,
        elapsedMs: decrypted.elapsedMs,
        message: decrypted.message,
        roundTripMatches: decrypted.status === "ok" ? decrypted.value?.result === "probe" : undefined,
      };
    }

    const encrypted = await race(safeStorage.encryptStringAsync("probe"), 5000);
    result.encrypt = { status: encrypted.status, elapsedMs: encrypted.elapsedMs, message: encrypted.message };
    if (encrypted.status === "ok" && encrypted.value)
      result.ciphertext = Buffer.from(encrypted.value).toString("base64");
    return result as SafeStorageProbe;
  }, previousProbeCiphertext);

  if (probe.ciphertext)
    previousProbeCiphertext = probe.ciphertext;
  return probe;
}

/** DIAG: lists the token store files the app can see, so a leaked token is visible in the log. */
async function listTokenStoreFiles(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(async ({ app: electronApp_ }) => {
    const fs = process.getBuiltinModule("node:fs");
    const path = process.getBuiltinModule("node:path");
    const dir = electronApp_.getPath("userData");
    try {
      return fs.readdirSync(dir)
        .filter((name) => name.startsWith("iTwinJs_"))
        .map((name) => `${name} (${fs.statSync(path.join(dir, name)).size}B)`);
    } catch (error) {
      return [`<unreadable ${dir}: ${error instanceof Error ? error.message : String(error)}>`];
    }
  });
}

function diag(label: string, data: unknown): void {
  console.log(`[DIAG] ${label}: ${JSON.stringify(data)}`); // eslint-disable-line no-console
}

async function launchApp(): Promise<void> {
  electronApp = await electron.launch({
    args: ["./dist/integration-test/test-app/index.js"],
  });
  electronPage = await electronApp.firstWindow();
  await captureExternalUrls(electronApp);
}

test.beforeEach(async ({}, testInfo) => {
  await Promise.all(tokenStores.map(async (store) => store.delete()));
  await launchApp();

  // The deletion above is only effective if the tests write to the same place the app
  // does. When these drift the app keeps a token the tests believe they removed, and the
  // next sign in stalls decrypting it rather than failing here.
  const appUserDataPath = await electronApp.evaluate(async ({ app }) => app.getPath("userData"));
  expect(appUserDataPath).toBe(userDataPath);

  diag(`beforeEach "${testInfo.title}" tokenFiles`, await listTokenStoreFiles(electronApp));
  diag(`beforeEach "${testInfo.title}" safeStorage`, await probeSafeStorage(electronApp));
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

// DIAG: reproduces what happened on Linux before the user data path fix — a token from a
// previous app process is still on disk when a fresh app's signIn() runs. Records the
// outcome instead of asserting, so every platform reports what it does.
test("DIAG: sign in with a token left by a previous app process", async ({ browser }) => {
  test.setTimeout(90000);
  const page = await browser.newPage();
  await testHelper.clickSignIn(electronPage);
  await testHelper.signIn(page, await waitForSignInUrl(electronApp));
  await testHelper.checkStatus(electronPage, true);
  await page.close();

  // Relaunch WITHOUT deleting the token stores.
  await electronApp.close();
  await waitForRedirectPortRelease();
  await launchApp();
  diag("relaunch tokenFiles", await listTokenStoreFiles(electronApp));
  diag("relaunch safeStorage", await probeSafeStorage(electronApp));

  const started = Date.now();
  await testHelper.clickSignIn(electronPage);

  let urlOpened: string | undefined;
  let status: string | null = null;
  let appError: string | null = null;
  const deadline = started + 30000;
  for (;;) {
    urlOpened = await takeExternalUrl(electronApp, "signIn");
    await electronPage.getByTestId("getStatus").click();
    status = await electronPage.locator("#status").textContent();
    appError = await electronPage.locator("#error").textContent();
    if (urlOpened || status === "Status: signed in" || appError)
      break;
    if (Date.now() >= deadline)
      break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const elapsedMs = Date.now() - started;

  let outcome: string;
  if (urlOpened)
    outcome = "INTERACTIVE: app opened a sign in URL, cached token was NOT used";
  else if (status === "Status: signed in")
    outcome = "SILENT: app signed in from the cached token without opening a URL";
  else if (appError)
    outcome = "ERROR: signIn() rejected";
  else
    outcome = "STALL: no URL, not signed in, no error within 30s";

  diag("relaunch signIn outcome", { outcome, elapsedMs, status, appError, urlOpened: urlOpened ? new URL(urlOpened).origin : undefined });

  // Let the app finish whatever it started so afterEach can close it cleanly.
  if (urlOpened) {
    const page2 = await browser.newPage();
    await testHelper.signIn(page2, urlOpened);
    await testHelper.checkStatus(electronPage, true);
    await page2.close();
  }
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
