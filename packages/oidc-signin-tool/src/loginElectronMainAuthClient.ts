/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import type { TestUserCredentials, } from "./TestUsers";
import * as SignInAutomation from "./SignInAutomation";
import type { ElectronApplication, JSHandle } from "@playwright/test";
import * as assert from "node:assert";

/**
 * playwright (and other async contexts) will eagerly evaluate returned promises
 * so return an object wrapping the promise
 */
type PromiseHandle<T> = JSHandle<{ promise: Promise<T> }>;

/** @note the PromiseHandle must wrap a JSON-serializable object */
async function promiseHandleValue<T>(promiseHandle: PromiseHandle<T>): Promise<T> {
  const promiseValueHandle = await promiseHandle.evaluateHandle(async (h) => h.promise);
  return promiseValueHandle.jsonValue();
}

/**
 * returns a handle to a pending promise that resolves the next time electron.shell.openExternal is called
 */
async function setupGetNextFetchedUrl(app: ElectronApplication): Promise<PromiseHandle<string>> {
  return app.evaluateHandle(({ shell }) => {
    return {
      promise: new Promise<string>((resolve) => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const originalOpenExternal = shell.openExternal;
        shell.openExternal = async (url: string) => {
          shell.openExternal = originalOpenExternal;
          return resolve(url);
        };
      }),
    };
  });
}

async function getExtraWindowAsBrowserFromElectron(app: ElectronApplication) {
  const prevWindows = app.windows();
  const prevWindowCount = prevWindows.length;

  await app.evaluate(
    // eslint-disable-next-line @typescript-eslint/naming-convention
    async ({ BrowserWindow }) => {
      new BrowserWindow({
        webPreferences: {
          partition: "login",
        },
      });
    },
  );

  const nowWindows = app.windows();
  assert(prevWindowCount === nowWindows.length - 1);
  const loginWindow = nowWindows[nowWindows.length - 1];

  return loginWindow;
}

/**
 * given an electron app, user, auth config, and a callback to start signing in,
 * complete the log in flow as that user.
 * @alpha
 */
export async function loginElectronMainAuthClient(
  app: ElectronApplication,
  /** any function that initiates ElectronMainAuthorization.signIn() */
  startSignIn: () => Promise<void>,
  user: TestUserCredentials,
  config: SignInAutomation.AutomatedSignInConfig,
  loginBrowser: "chromium" | "separate-electron-window" = "chromium",
) {
  const nextFetchedUrlPromise = await setupGetNextFetchedUrl(app);
  void startSignIn();
  const requestedLoginUrl = await promiseHandleValue(nextFetchedUrlPromise);
  if (!requestedLoginUrl)
    throw Error("requestedLoginPage should be defined");

  // the page will be closed by automatedSignIn
  const page = loginBrowser === "chromium"
    ? await SignInAutomation.launchDefaultAutomationPage()
    : await getExtraWindowAsBrowserFromElectron(app);

  await SignInAutomation.automatedSignIn({
    page,
    signInInitUrl: requestedLoginUrl,
    user,
    config,
  });
}
