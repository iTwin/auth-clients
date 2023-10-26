/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import type { TestUserCredentials } from "./TestUsers";
import * as SignInAutomation from "./SignInAutomation";
import type { ElectronApplication, JSHandle, Page } from "@playwright/test";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type Electron = typeof import("electron");

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
 * helper type to allow non-ElectronApplication contexts
 * e.g. a thirdparty playwright API implementation over an electron utility process
 * @alpha
 */
export interface PlaywrightElectronContext {
  evaluate<T, R>(
    func: (electron: Electron, passed?: T) => R,
    args?: T
  ): Promise<R>;
  evaluateHandle<T, R>(
    func: (electron: Electron, passed?: T) => R,
    args?: T
  ): Promise<JSHandle<R>>;
}

/**
 * returns a handle to a pending promise that resolves the next time electron.shell.openExternal is called
 */
async function setupGetNextFetchedUrl(app: PlaywrightElectronContext): Promise<PromiseHandle<string>> {
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

// FIXME: used wrong indent setting everywhere!
async function getExtraWindowAsBrowserFromElectron(app: ElectronApplication) {
  const newWindowPromise = new Promise<Page>((resolve) => app.on("window", resolve));

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

  return newWindowPromise;
}

/**
 * given an electron app, auth configuration, and a callback to start signing in,
 * complete the log in flow as the configured user.
 * @alpha
 */
export async function loginElectronMainAuthClient(
  {
    app,
    backendContext = app,
    startSignIn,
    user,
    config,
    loginBrowser = "chromium",
  }: {
    app: ElectronApplication;
    /** the playwright context which holds iTwin.js backend code.
     * @default the passed in app, since that is usually where backend code is run
     */
    backendContext?: PlaywrightElectronContext | ElectronApplication;
    /** any function that eventually invokes ElectronMainAuthorization.signIn() */
    startSignIn: () => Promise<void>;
    user: TestUserCredentials;
    config: SignInAutomation.AutomatedSignInConfig;
    loginBrowser?: "chromium" | "separate-electron-window";
  }
) {
  const nextFetchedUrlPromise = await setupGetNextFetchedUrl(backendContext);
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
