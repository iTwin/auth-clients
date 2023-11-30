/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as os from "node:os";
import type { Browser, LaunchOptions, Page } from "@playwright/test";
import type { TestUserCredentials } from "./TestUsers";
import { testSelectors } from "./TestSelectors";

/** @internal configuration for automated sign in */
export interface AutomatedSignInConfig {
  issuer: string;
  /** optional endpoint configuration to verify when handling ping login page */
  authorizationEndpoint?: string;
}

/** @internal base context for automated sign in and sign out functions */
interface AutomatedContextBase<T> {
  page: Page;
  user: TestUserCredentials;
  config: AutomatedSignInConfig;
  /** a promise that resolves once the sign in callback is reached,
   * with any data, e.g. a callback URL
   * @defaults Promise.resolve()
   */
  waitForCallback?: Promise<T>;
  /** A function that takes the waitForCallback result data (e.g. a callback url)
   * and finalizes the sign in process
   */
  resultFromCallback?: (t: T) => any | Promise<any>;
  /** optionally provide the abort controller for errors,
   * in case you need to cancel your waitForCallbackUrl */
  abortController?: AbortController;

  /** whether or not to kill the entire browser when cleaning up */
  doNotKillBrowser?: boolean;
}

/** @internal context for automated sign in functions */
export interface AutomatedSignInContext<T> extends AutomatedContextBase<T> {
  signInInitUrl: string;
}

/** @internal context for automated sign in functions */
export interface AutomatedSignOutContext<T> extends AutomatedContextBase<T> {
  signOutInitUrl: string;
}

/**
 * given a context with configuration, user info, a playwright page,
 * and iTwin services sign in url, sign in
 * @internal
 */
export async function automatedSignIn<T>(
  context: AutomatedSignInContext<T>,
): Promise<void> {
  const { page } = context;
  const waitForCallback = context.waitForCallback ?? Promise.resolve() as Promise<T>;
  const controller = context.abortController ?? new AbortController();

  try {
    await page.goto(context.signInInitUrl);

    try {
      await handleErrorPage(context);

      await handleLoginPage(context);

      await handlePingLoginPage(context);

      // Handle federated sign-in
      await handleFederatedSignin(context);
    } catch (err) {
      controller.abort();
      throw new Error(`Failed OIDC signin for ${context.user.email}.\n${err}`);
    }

    try {
      await handleConsentPage(context);
    } catch (error) {
      // ignore, if we get the callback Url, we're good.
    }

    if (context.resultFromCallback)
      // if we do not await here, logic in resultFromCallback can escape the cleanup in finally
      // eslint-disable-next-line @typescript-eslint/return-await
      return await context.resultFromCallback(await waitForCallback);
  } finally {
    await cleanup(page, controller.signal, waitForCallback, context.doNotKillBrowser);
  }
}

/**
 * given a context with configuration, user info, a playwright page,
 * and iTwin services sign out url, sign out
 * @internal
 */
export async function automatedSignOut<T>(
  context: AutomatedSignOutContext<T>,
): Promise<void> {
  const { page } = context;
  const waitForCallback = context.waitForCallback ?? Promise.resolve() as Promise<T>;
  const controller = context.abortController ?? new AbortController();

  try {
    await page.goto(context.signOutInitUrl);
  } finally {
    await cleanup(page, controller.signal, waitForCallback, context.doNotKillBrowser);
  }
}

async function handleErrorPage<T>({ page }: AutomatedContextBase<T>): Promise<void> {
  await page.waitForLoadState("networkidle");
  const pageTitle = await page.title();
  let errMsgText;

  if (pageTitle.toLocaleLowerCase() === "error")
    errMsgText = await page.content();

  if (null === errMsgText)
    throw new Error("Unknown error page detected.");

  if (undefined !== errMsgText)
    throw new Error(errMsgText);
}

async function handleLoginPage<T>(context: AutomatedContextBase<T>): Promise<void> {
  const loginUrl = new URL("/IMS/Account/Login", context.config.issuer);
  const { page } = context;
  if (page.url().startsWith(loginUrl.toString())) {
    await page.waitForSelector(testSelectors.imsEmail);
    await page.type(testSelectors.imsEmail, context.user.email);
    await page.waitForSelector(testSelectors.imsPassword);
    await page.type(testSelectors.imsPassword, context.user.password);

    const submit = page.locator(testSelectors.imsSubmit);
    await submit.click();
  }

  // Check if there were any errors when performing sign-in
  await checkErrorOnPage(page, "#errormessage");
}

async function handlePingLoginPage<T>(context: AutomatedContextBase<T>): Promise<void> {
  const { page } = context;
  if (
    context.config.authorizationEndpoint !== undefined && (
      !page.url().startsWith(context.config.authorizationEndpoint) ||
      -1 === page.url().indexOf("ims")
    )
  )
    return;

  await page.waitForSelector(testSelectors.pingEmail);
  await page.type(testSelectors.pingEmail, context.user.email);

  await page.waitForSelector(testSelectors.pingAllowSubmit);
  let allow = page.locator(testSelectors.pingAllowSubmit);
  await allow.click();

  // Cut out for federated sign-in
  if (-1 !== page.url().indexOf("microsoftonline"))
    return;

  await page.waitForSelector(testSelectors.pingPassword);
  await page.type(testSelectors.pingPassword, context.user.password);

  await page.waitForSelector(testSelectors.pingAllowSubmit);
  allow = page.locator(testSelectors.pingAllowSubmit);
  await allow.click();

  await page.waitForLoadState("networkidle");
  const error = page.getByText(
    "We didn't recognize the email address or password you entered. Please try again."
  );

  const count = await error.count();

  if (count) {
    throw new Error(
      "We didn't recognize the email address or password you entered. Please try again."
    );
  }

  // Check if there were any errors when performing sign-in
  await checkErrorOnPage(page, ".ping-error");
}

// Bentley-specific federated login.  This will get called if a redirect to a url including "microsoftonline".
async function handleFederatedSignin<T>(context: AutomatedContextBase<T>): Promise<void> {
  const { page } = context;

  await page.waitForLoadState("networkidle");
  if (-1 === page.url().indexOf("microsoftonline"))
    return;

  if (await checkSelectorExists(page, testSelectors.msUserNameField)) {
    await page.type(testSelectors.msUserNameField, context.user.email);
    const msSubmit = await page.waitForSelector(testSelectors.msSubmit);
    await msSubmit.click();

    // Checks for the error in username entered
    await checkErrorOnPage(page, "#usernameError");
  } else {
    const fedEmail = await page.waitForSelector(testSelectors.fedEmail);
    await fedEmail.type(context.user.email);
  }

  const fedPassword = await page.waitForSelector(testSelectors.fedPassword);
  await fedPassword.type(context.user.password);
  const submit = await page.waitForSelector(testSelectors.fedSubmit);
  await submit.click();

  // Need to check for invalid username/password directly after the submit button is pressed
  let errorExists = false;
  try {
    errorExists = await checkSelectorExists(page, "#errorText");
  } catch (err) {
    // continue with navigation even if throws
  }

  if (errorExists)
    await checkErrorOnPage(page, "#errorText");

  // May need to accept an additional prompt.
  if (
    -1 !== page.url().indexOf("microsoftonline") &&
    (await checkSelectorExists(page, testSelectors.msSubmit))
  ) {
    const msSubmit = await page.waitForSelector(testSelectors.msSubmit);
    await msSubmit.click();
  }
}

async function handleConsentPage<T>(context: AutomatedContextBase<T>): Promise<void> {
  const { page } = context;

  if ((await page.title()) === "localhost")
    return; // we're done

  const consentUrl = new URL("/consent", context.config.issuer);
  if (page.url().startsWith(consentUrl.toString()))
    await page.click("button[value=yes]");

  const pageTitle = await page.title();

  if (pageTitle === "Request for Approval") {
    const pingSubmit = await page.waitForSelector(
      testSelectors.pingAllowSubmit
    );
    await pingSubmit.click();
  } else if ((await page.title()) === "Permissions") {
    // Another new consent page...
    const acceptButton = await page.waitForSelector(
      "xpath=(//button/span[text()='Accept'] | //div[contains(@class, 'ping-buttons')]/a[text()='Accept'])[1]"
    );
    await acceptButton.click();
  }
}

async function checkSelectorExists(
  page: Page,
  selector: string
): Promise<boolean> {
  const element = await page.$(selector);
  return !!element;
}

async function checkErrorOnPage(page: Page, selector: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  const errMsgElement = await page.$(selector);
  if (errMsgElement) {
    const errMsgText = await errMsgElement.textContent();
    if (undefined !== errMsgText && null !== errMsgText)
      throw new Error(errMsgText);
  }
}

/** @internal use playwright to launch the default automation page, which is a chromium instance */
export async function launchDefaultAutomationPage(enableSlowNetworkConditions = false): Promise<Page> {
  const launchOptions: LaunchOptions = {};

  if (process.env.ODIC_SIGNIN_TOOL_EXTRA_LAUNCH_OPTS) {
    const extraLaunchOpts = JSON.parse(process.env.ODIC_SIGNIN_TOOL_EXTRA_LAUNCH_OPTS);
    Object.assign(launchOptions, extraLaunchOpts);
  }

  if (os.platform() === "linux") {
    launchOptions.args = [...launchOptions.args ?? [], "--no-sandbox"];
  }

  const proxyUrl = process.env.HTTPS_PROXY;

  if (proxyUrl) {
    const proxyUrlObj = new URL(proxyUrl);
    launchOptions.proxy = {
      server: `${proxyUrlObj.protocol}//${proxyUrlObj.host}`,
      username: proxyUrlObj.username,
      password: proxyUrlObj.password,
    };
  }

  let browser: Browser;
  try {
    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch(launchOptions);
  } catch (err) {
    /* eslint-disable no-console */
    console.error("Original error:");
    console.error(err);
    /* eslint-enable no-console */
    throw Error(
      "Could not load @playwright/test. Do you have multiple playwright dependencies active? "
      + "If so, then you should provide your own playwright Page to automation APIs to avoid us "
      + "attempting to make our own by importing playwright"
    );
  }

  let page: Page;
  if (enableSlowNetworkConditions) {
    const context = await browser.newContext();
    page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: 200 * 1024,
      uploadThroughput: 50 * 1024,
      latency: 1000,
    });
  } else {
    page = await browser.newPage();
  }

  return page;
}

async function cleanup(
  page: Page,
  signal: AbortSignal,
  waitForCallbackUrl: Promise<any>,
  doNotKillBrowser = false,
) {
  if (signal.aborted)
    await page.reload();
  await waitForCallbackUrl;
  await page.close();

  const doKillBrowser = !doNotKillBrowser;

  if (doKillBrowser) {
    await page.context().close();
    await page.context().browser()?.close();
  }
}
