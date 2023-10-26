/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import type {
  TestUserCredentials,
} from "./TestUsers";
import * as SignInAutomation from "./SignInAutomation";
import type { ElectronApplication, JSHandle } from "@playwright/test";

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

export async function loginElectronMainAuthClient(
  app: ElectronApplication,
  /** any function that initiates ElectronMainAuthorization.signIn() */
  startSignIn: () => Promise<void>,
  user: TestUserCredentials,
  config: SignInAutomation.AutomatedSignInConfig,
) {
  const nextFetchedUrlPromise = await setupGetNextFetchedUrl(app);
  void startSignIn();
  const requestedLoginUrl = await promiseHandleValue(nextFetchedUrlPromise);
  if (!requestedLoginUrl)
    throw Error("requestedLoginPage should be defined");

  // FIXME: remove
  /*
  await app.evaluate(
    // eslint-disable-next-line @typescript-eslint/naming-convention
    async ({ BrowserWindow }, passed) => {
      const loginWindow = new BrowserWindow({
        webPreferences: {
          partition: "login",
        },
      });
      await loginWindow.loadURL(passed.requestedLoginUrl);
    },
    { requestedLoginUrl }
  );
  */

  const page = await SignInAutomation.launchDefaultAutomationPage();

  await SignInAutomation.automatedSignIn({
    page,
    signInInitUrl: requestedLoginUrl,
    user,
    config,
    waitForCallbackUrl: async () => {},
    resultFromCallbackUrl: async () => {},
  });
}
