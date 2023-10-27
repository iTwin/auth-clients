/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import type { TestUserCredentials } from "./TestUsers";
import * as SignInAutomation from "./SignInAutomation";
import type { ElectronApplication } from "@playwright/test";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type Electron = typeof import("electron");

/**
 * helper type to allow non-ElectronApplication contexts
 * e.g. a thirdparty playwright API implementation over an electron utility process
 * @alpha
 */
export interface PlaywrightElectronContext {
  evaluate<T, R>(
    func: (electron: Electron, passed: T) => R,
    passed?: T
  ): Promise<R>;
}

/**
 * playwright will eagerly evaluate returned promises, so instead return an indirect handle
 * to one (a string key on the globalThis object)
 * We could return a JSHandle<{ promise: Promise<T> }, but @see PlaywrightElectronContext
 * does not support that to avoid requiring custom contexts implement JSHandle
 */
type PromiseHandle = string;

/** @note the PromiseHandle must wrap a JSON-serializable object */
async function promiseHandleValue<T>(ctx: PlaywrightElectronContext, promiseHandle: PromiseHandle): Promise<T> {
  return ctx.evaluate(async (_electron, passed) => {
    const promise = (globalThis as any)[passed];
    delete (globalThis as any)[passed];
    return promise;
  }, promiseHandle);
}

/**
 * returns a handle to a pending promise that resolves the next time electron.shell.openExternal is called
 */
async function setupGetNextFetchedUrl(app: PlaywrightElectronContext): Promise<string> {
  return app.evaluate(({ shell }) => {
    const handle = `promiseHandle_${Math.random()}`;

    (globalThis as any)[handle] = new Promise<string>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalOpenExternal = shell.openExternal;
      shell.openExternal = async (url: string) => {
        shell.openExternal = originalOpenExternal;
        return resolve(url);
      };
    });

    return handle;
  });
}

async function getExtraWindowAsBrowserFromElectron(app: ElectronApplication, url: string) {
  const newWindowPromise = app.waitForEvent("window");

  await app.evaluate(
    // eslint-disable-next-line @typescript-eslint/naming-convention
    async ({ BrowserWindow }, passed) => {
      const loginPage = new BrowserWindow({
        title: "separate-electron-window",
        webPreferences: {
          partition: "login",
        },
      });
      // REPORTME: probable playwright bug, for electron, the "window" event is
      // not emitted until a URL is loaded in the new window, so we early-load the login URL
      // if the bug were fixed, this would not be necessary, as it will be navigated to again later
      await loginPage.loadURL(passed.url);
    },
    { url }
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
  const requestedLoginUrl = await promiseHandleValue<string>(backendContext, nextFetchedUrlPromise);
  if (!requestedLoginUrl)
    throw Error("requestedLoginPage should be defined");

  // the page will be closed by automatedSignIn
  const page = loginBrowser === "chromium"
    ? await SignInAutomation.launchDefaultAutomationPage()
    : await getExtraWindowAsBrowserFromElectron(app, requestedLoginUrl);

  await SignInAutomation.automatedSignIn({
    page,
    signInInitUrl: requestedLoginUrl,
    user,
    config,
    doNotKillBrowser: loginBrowser === "separate-electron-window",
  });
}
