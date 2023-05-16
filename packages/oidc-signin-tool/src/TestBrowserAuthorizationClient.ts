/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import type { AccessToken } from "@itwin/core-bentley";
import { BeEvent } from "@itwin/core-bentley";
import type { AuthorizationClient } from "@itwin/core-common";
import type {
  AuthorizationParameters,
  Client,
  ClientMetadata,
  OpenIDCallbackChecks,
} from "openid-client";
import { custom, generators, Issuer } from "openid-client";
import * as os from "os";
import { chromium } from "@playwright/test";
import type { LaunchOptions, Page, Request } from "@playwright/test";
import type {
  TestBrowserAuthorizationClientConfiguration,
  TestUserCredentials,
} from "./TestUsers";
import { testSelectors } from "./TestSelectors";
/**
 * Implementation of AuthorizationClient used for the iModel.js integration tests.
 * - this is only to be used in test environments, and **never** in production code.
 * - use static create method to create an authorization client for the specified user credentials.
 * - calling getAccessToken() the first time, or after token expiry, causes the authorization to happen by
 *   spawning a headless browser, and automatically filling in the supplied user credentials.
 * @alpha
 */
export class TestBrowserAuthorizationClient implements AuthorizationClient {
  private _client!: Client;
  private _issuer!: Issuer<Client>;
  private _authorityUrl: string = "https://ims.bentley.com";
  private readonly _config: TestBrowserAuthorizationClientConfiguration;
  private readonly _user: TestUserCredentials;
  private _accessToken: AccessToken = "";
  private _expiresAt?: Date | undefined = undefined;
  /**
   * Constructor
   * @param config OIDC configuration
   * @param user Test user to be logged in
   */
  public constructor(
    config: TestBrowserAuthorizationClientConfiguration,
    user: TestUserCredentials
  ) {
    this._config = config;
    this._user = user;

    let prefix = process.env.IMJS_URL_PREFIX;
    const authority = new URL(this._config.authority ?? this._authorityUrl);
    if (prefix && !this._config.authority) {
      prefix = prefix === "dev-" ? "qa-" : prefix;
      authority.hostname = prefix + authority.hostname;
    }
    this._authorityUrl = authority.href.replace(/\/$/, "");
  }

  private async initialize() {
    // Due to issues with a timeout or failed request to the authorization service increasing the standard timeout and adding retries.
    // Docs for this option here, https://github.com/panva/node-openid-client/tree/master/docs#customizing-http-requests
    custom.setHttpOptionsDefaults({
      timeout: 10000,
      retry: 3,
    });

    this._issuer = await Issuer.discover(this._authorityUrl);
    const clientMetadata: ClientMetadata = {
      client_id: this._config.clientId, // eslint-disable-line @typescript-eslint/naming-convention
      token_endpoint_auth_method: "none", // eslint-disable-line @typescript-eslint/naming-convention
    };
    this._client = new this._issuer.Client(clientMetadata); // eslint-disable-line @typescript-eslint/naming-convention
  }

  public readonly onAccessTokenChanged = new BeEvent<(token: AccessToken) => void>();

  /** Returns true if there's a current authorized user or client (in the case of agent applications).
   * Returns true if signed in and the access token has not expired, and false otherwise.
   */
  public get isAuthorized(): boolean {
    return !!this._accessToken && !this.hasExpired;
  }

  /** Returns true if the user has signed in, but the token has expired and requires a refresh */
  public get hasExpired(): boolean {
    if (!this._accessToken || !this._expiresAt)
      return false;
    // show expiry one minute before actual time to refresh
    return this._expiresAt.getTime() - Date.now() <= 1 * 60 * 1000;
  }

  /** Returns true if the user has signed in, but the token has expired and requires a refresh */
  public get hasSignedIn(): boolean {
    return !!this._accessToken;
  }

  /** Returns a promise that resolves to the AccessToken of the currently authorized user
   * or authorized client (in the case of agent applications).
   * The token is refreshed if necessary and possible.
   * @throws [[BentleyError]] If the client was not used to authorize, or there was an authorization error.
   */
  public async getAccessToken(): Promise<AccessToken> {
    if (this.isAuthorized)
      return this._accessToken;

    // Add retry logic to help avoid flaky issues on CI machines.
    let numRetries = 0;
    while (numRetries < 3) {
      try {
        await this.signIn();
      } catch (err) {
        // rethrow error if hit max number of retries or if it's not a navigation failure (i.e. a flaky failure)
        if (
          numRetries === 2 ||
          (err instanceof Error &&
            -1 ===
            err.message.indexOf(
              "Execution context was destroyed, most likely because of a navigation"
            ))
        )
          throw err;
        numRetries++;
        continue;
      }

      break;
    }

    return this._accessToken;
  }

  public async signIn(): Promise<void> {
    if (this._client === undefined)
      await this.initialize();

    // eslint-disable-next-line no-console
    console.log(`Starting OIDC signin for ${this._user.email} ...`);

    const [authParams, callbackChecks] = this.createAuthParams(
      this._config.scope
    );
    const authorizationUrl = this._client.authorizationUrl(authParams);

    const page = await this.launchBrowser();

    const controller = new AbortController();
    const { signal } = controller;

    const waitForCallbackUrl = page.waitForRequest((req: Request) => {
      return req.url().startsWith(this._config.redirectUri) || signal.aborted;
    });

    try {
      // Eventually, we'll get a redirect to the callback url
      // including the params we need to retrieve a token
      // This varies depending on the type of user, so start
      // waiting now and resolve at the end of the "sign in pipeline"

      await page.goto(authorizationUrl);

      try {
        await this.handleErrorPage(page);

        await this.handleLoginPage(page);

        await this.handlePingLoginPage(page);

        // Handle federated sign-in
        await this.handleFederatedSignin(page);
      } catch (err) {
        controller.abort();
        throw new Error(`Failed OIDC signin for ${this._user.email}.\n${err}`);
      }

      try {
        await this.handleConsentPage(page);
      } catch (error) {
        // ignore, if we get the callback Url, we're good.
      }

      const callbackUrl = await waitForCallbackUrl;
      if (callbackUrl) {
        const tokenSet = await this._client.oauthCallback(
          this._config.redirectUri,
          this._client.callbackParams(callbackUrl.url()),
          callbackChecks
        );

        this._accessToken = `Bearer ${tokenSet.access_token}`;
        if (tokenSet.expires_at)
          this._expiresAt = new Date(tokenSet.expires_at * 1000);
        this.onAccessTokenChanged.raiseEvent(this._accessToken);
      }
    } finally {
      await this.cleanup(page, signal, waitForCallbackUrl);
    }
  }

  public async signOut(): Promise<void> {
    this._accessToken = "";
    this.onAccessTokenChanged.raiseEvent(this._accessToken);
  }

  private createAuthParams(
    scope: string
  ): [AuthorizationParameters, OpenIDCallbackChecks] {
    const verifier = generators.codeVerifier();
    const state = generators.state();

    const authParams: AuthorizationParameters = {
      redirect_uri: this._config.redirectUri, // eslint-disable-line @typescript-eslint/naming-convention
      response_type: "code", // eslint-disable-line @typescript-eslint/naming-convention
      code_challenge: generators.codeChallenge(verifier), // eslint-disable-line @typescript-eslint/naming-convention
      code_challenge_method: "S256", // eslint-disable-line @typescript-eslint/naming-convention
      scope,
      state,
    };

    const callbackChecks: OpenIDCallbackChecks = {
      state,
      response_type: "code", // eslint-disable-line @typescript-eslint/naming-convention
      code_verifier: verifier, // eslint-disable-line @typescript-eslint/naming-convention
    };

    return [authParams, callbackChecks];
  }

  private async handleErrorPage(page: Page): Promise<void> {
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

  private async handleLoginPage(page: Page): Promise<void> {
    const loginUrl = new URL("/IMS/Account/Login", this._authorityUrl);
    if (page.url().startsWith(loginUrl.toString())) {
      await page.waitForSelector(testSelectors.imsEmail);
      await page.type(testSelectors.imsEmail, this._user.email);
      await page.waitForSelector(testSelectors.imsPassword);
      await page.type(testSelectors.imsPassword, this._user.password);

      const submit = page.locator(testSelectors.imsSubmit);
      await submit.click();
    }

    // Check if there were any errors when performing sign-in
    await this.checkErrorOnPage(page, "#errormessage");
  }

  private async handlePingLoginPage(page: Page): Promise<void> {
    if (
      undefined === this._issuer.metadata.authorization_endpoint ||
      !page.url().startsWith(this._issuer.metadata.authorization_endpoint) ||
      -1 === page.url().indexOf("ims")
    )
      return;

    await page.waitForSelector(testSelectors.pingEmail);
    await page.type(testSelectors.pingEmail, this._user.email);

    await page.waitForSelector(testSelectors.pingAllowSubmit);
    let allow = page.locator(testSelectors.pingAllowSubmit);
    await allow.click();

    // Cut out for federated sign-in
    if (-1 !== page.url().indexOf("microsoftonline"))
      return;

    await page.waitForSelector(testSelectors.pingPassword);
    await page.type(testSelectors.pingPassword, this._user.password);

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
    await this.checkErrorOnPage(page, ".ping-error");
  }

  // Bentley-specific federated login.  This will get called if a redirect to a url including "microsoftonline".
  private async handleFederatedSignin(page: Page): Promise<void> {
    await page.waitForLoadState("networkidle");
    if (-1 === page.url().indexOf("microsoftonline"))
      return;

    if (await this.checkSelectorExists(page, testSelectors.msUserNameField)) {
      await page.type(testSelectors.msUserNameField, this._user.email);
      const msSubmit = await page.waitForSelector(testSelectors.msSubmit);
      await msSubmit.click();

      // Checks for the error in username entered
      await this.checkErrorOnPage(page, "#usernameError");
    } else {
      const fedEmail = await page.waitForSelector(testSelectors.fedEmail);
      await fedEmail.type(this._user.email);
    }

    const fedPassword = await page.waitForSelector(testSelectors.fedPassword);
    await fedPassword.type(this._user.password);
    const submit = await page.waitForSelector(testSelectors.fedSubmit);
    await submit.click();

    // Need to check for invalid username/password directly after the submit button is pressed
    let errorExists = false;
    try {
      errorExists = await this.checkSelectorExists(page, "#errorText");
    } catch (err) {
      // continue with navigation even if throws
    }

    if (errorExists)
      await this.checkErrorOnPage(page, "#errorText");

    // May need to accept an additional prompt.
    if (
      -1 !== page.url().indexOf("microsoftonline") &&
      (await this.checkSelectorExists(page, testSelectors.msSubmit))
    ) {
      const msSubmit = await page.waitForSelector(testSelectors.msSubmit);
      await msSubmit.click();
    }
  }

  private async handleConsentPage(page: Page): Promise<void> {
    if ((await page.title()) === "localhost")
      return; // we're done

    const consentUrl = new URL("/consent", this._issuer.issuer as string);
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

  private async checkSelectorExists(
    page: Page,
    selector: string
  ): Promise<boolean> {
    const element = await page.$(selector);
    return !!element;
  }

  private async checkErrorOnPage(page: Page, selector: string): Promise<void> {
    await page.waitForLoadState("networkidle");
    const errMsgElement = await page.$(selector);
    if (errMsgElement) {
      const errMsgText = await errMsgElement.textContent();
      if (undefined !== errMsgText && null !== errMsgText)
        throw new Error(errMsgText);
    }
  }

  private async launchBrowser(enableSlowNetworkConditions = false) {
    let launchOptions: LaunchOptions = {};
    if (os.platform() === "linux") {
      launchOptions = {
        args: ["--no-sandbox"],
      };
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

    const browser = await chromium.launch(launchOptions);

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

  private async cleanup(
    page: Page,
    signal: AbortSignal,
    waitForCallbackUrl: Promise<Request | boolean>
  ) {
    if (signal.aborted)
      await page.reload();
    await waitForCallbackUrl;
    await page.close();
    await page.context().close();
    await page.context().browser()?.close();
  }
}

/**
 * Gets an OIDC token for testing.
 * - this is only to be used in test environments, and **never** in production code.
 * - causes authorization to happen by spawning a
 *  browser, and automatically filling in the supplied user credentials
 * @param config Oidc configuration
 * @param user User
 * @param deploymentRegion Deployment region. If unspecified, it's inferred from configuration, or simply defaults to "0" for PROD use
 * @alpha
 */
export async function getTestAccessToken(
  config: TestBrowserAuthorizationClientConfiguration,
  user: TestUserCredentials
): Promise<AccessToken | undefined> {
  const client = new TestBrowserAuthorizationClient(config, user);
  return client.getAccessToken();
}
