/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { AccessToken } from "@itwin/core-bentley";
import { BeEvent } from "@itwin/core-bentley";
import type { AuthorizationClient } from "@itwin/core-common";
import type { AuthorizationParameters, Client, ClientMetadata, HttpOptions, OpenIDCallbackChecks } from "openid-client";
import { custom, generators, Issuer } from "openid-client";
import * as os from "os";
import * as puppeteer from "puppeteer";
import type { TestBrowserAuthorizationClientConfiguration, TestUserCredentials } from "./TestUsers";

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
  public constructor(config: TestBrowserAuthorizationClientConfiguration, user: TestUserCredentials) {
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
    // Keep a list of http defaults
    const httpOptionsDefaults: HttpOptions = {
      timeout: 10000,
    };

    // AzureAD needs to have the origin header to allow CORS
    if (-1 !== this._authorityUrl.indexOf("microsoftonline"))
      httpOptionsDefaults.headers = { Origin: "http://localhost" }; // eslint-disable-line @typescript-eslint/naming-convention

    // Due to issues with a timeout or failed request to the authorization service increasing the standard timeout and adding retries.
    // Docs for this option here, https://github.com/panva/node-openid-client/tree/master/docs#customizing-http-requests
    custom.setHttpOptionsDefaults(httpOptionsDefaults);

    this._issuer = await Issuer.discover(this._authorityUrl);
    const clientMetadata: ClientMetadata = {
      client_id: this._config.clientId, // eslint-disable-line @typescript-eslint/naming-convention
      token_endpoint_auth_method: "none", // eslint-disable-line @typescript-eslint/naming-convention
    };
    if (this._config.clientSecret) {
      clientMetadata.client_secret = this._config.clientSecret;
      clientMetadata.token_endpoint_auth_method = "client_secret_basic";
    }
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
    return ((this._expiresAt.getTime() - Date.now()) <= 1 * 60 * 1000);
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
        if (numRetries === 2 ||
          (err instanceof Error && -1 === err.message.indexOf("Execution context was destroyed, most likely because of a navigation")))
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
    // console.log(`Starting OIDC signin for ${this._user.email} ...`);

    const [authParams, callbackChecks] = this.createAuthParams(this._config.scope);
    const authorizationUrl = this._client.authorizationUrl(authParams);

    // Launch puppeteer with no sandbox only on linux
    let launchOptions: puppeteer.BrowserLaunchArgumentOptions & puppeteer.LaunchOptions = { dumpio: true }; // , headless: false, slowMo: 500 };
    if (os.platform() === "linux") {
      launchOptions = {
        args: ["--no-sandbox"], // , "--disable-setuid-sandbox"],
      };
    }

    const proxyUrl = process.env.HTTPS_PROXY;
    let proxyAuthOptions: puppeteer.Credentials | undefined;
    if (proxyUrl) {
      const proxyUrlObj = new URL(proxyUrl);
      proxyAuthOptions = { username: proxyUrlObj.username, password: proxyUrlObj.password };
      const proxyArg = `--proxy-server=${proxyUrlObj.protocol}//${proxyUrlObj.host}`;
      if (launchOptions.args)
        launchOptions.args.push(proxyArg);
      else
        launchOptions.args = [proxyArg];
    }

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    if (proxyAuthOptions) {
      await page.authenticate(proxyAuthOptions);
    }

    await page.setRequestInterception(true);
    const onRedirectRequest = this.interceptRedirectUri(page);
    const navigationOptions: puppeteer.WaitForOptions = {
      waitUntil: "networkidle2",
    };

    if (-1 !== authorizationUrl.indexOf("microsoftonline")) // If OAuthProvider is AzureAD, we want to wait till the page has no more network requests
      navigationOptions.waitUntil = ["networkidle0"];
    else if (-1 !== authorizationUrl.indexOf("authing")) // If OAuthProvider is Authing, page fires different events at different intervals. The safest bet is to wait for all events to finish
      navigationOptions.waitUntil = ["load", "domcontentloaded", "networkidle0"];
    await page.goto(authorizationUrl, navigationOptions);

    try {
      await this.handleErrorPage(page);

      await this.handleLoginPage(page);

      await this.handlePingLoginPage(page);

      // Handle federated sign-in
      await this.handleFederatedSignin(page);

      // Handle AzureAD sign-in
      await this.handleAzureADSignin(page);

      // Handle Authing sign-in
      await this.handleAuthingSignin(page);
    } catch (err) {
      await page.close();
      await browser.close();
      throw new Error(`Failed OIDC signin for ${this._user.email}.\n${err}`);
    }

    await this.handleConsentPage(page);

    const callbackParams = this._client.callbackParams(await onRedirectRequest);
    const tokenSet = !callbackParams.id_token
      ? await this._client.oauthCallback(this._config.redirectUri, callbackParams, callbackChecks)
      : await this._client.callback(this._config.redirectUri, callbackParams, callbackChecks);

    await page.close();
    await browser.close();

    this._accessToken = `Bearer ${tokenSet.access_token}`;
    if (tokenSet.expires_at)
      this._expiresAt = new Date(tokenSet.expires_at * 1000);
    this.onAccessTokenChanged.raiseEvent(this._accessToken);
  }

  public async signOut(): Promise<void> {
    this._accessToken = "";
    this.onAccessTokenChanged.raiseEvent(this._accessToken);
  }

  private createAuthParams(scope: string): [AuthorizationParameters, OpenIDCallbackChecks] {
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

  private async interceptRedirectUri(page: puppeteer.Page): Promise<string> {
    return new Promise<string>((resolve) => {
      page.on("request", async (interceptedRequest) => {
        const reqUrl = interceptedRequest.url();
        if (reqUrl.startsWith(this._config.redirectUri)) {
          await interceptedRequest.respond({ status: 200, contentType: "text/html", body: "OK" });
          resolve(reqUrl);
          return;
        }

        await interceptedRequest.continue();
      });
    });
  }

  private async handleErrorPage(page: puppeteer.Page): Promise<void> {
    const errMsgText = await page.evaluate(() => {
      const title = document.title;
      if (title.toLocaleLowerCase() === "error")
        return document.body.textContent;
      return undefined;
    });

    if (null === errMsgText)
      throw new Error("Unknown error page detected.");

    if (undefined !== errMsgText)
      throw new Error(errMsgText);
  }

  private async handleLoginPage(page: puppeteer.Page): Promise<void> {
    const loginUrl = new URL("/IMS/Account/Login", this._authorityUrl);
    if (page.url().startsWith(loginUrl.toString())) {
      await page.waitForSelector("[name=EmailAddress]");
      await page.type("[name=EmailAddress]", this._user.email);
      await page.waitForSelector("[name=Password]");
      await page.type("[name=Password]", this._user.password);
      await Promise.all([
        page.waitForNavigation({
          // Need to wait for 'load' here instead of using 'networkidle2' because during a federated login there is a second redirect. With a fast connection,
          // the redirect happens so quickly it doesn't hit the 500 ms threshold that puppeteer expects for an idle network.
          waitUntil: "load",
        }),
        page.$eval("#submitLogon", (button: any) => button.click()),
      ]);
    }

    // There are two page loads if it's a federated user because of a second redirect.
    // Note: On a fast internet connection this is not needed but on slower ones it will be.  See comment above for previous 'waitForNavigation' for details.
    if (-1 !== page.url().indexOf("microsoftonline")) {
      try {
        await this.checkSelectorExists(page, "#i0116");
      } catch (err) {
        // continue with navigation when it throws.  This means the page hasn't fully loaded yet
        await page.waitForNavigation({ waitUntil: "networkidle2" });
      }
    }

    // Check if there were any errors when performing sign-in
    await this.checkErrorOnPage(page, "#errormessage");
  }

  private async handlePingLoginPage(page: puppeteer.Page): Promise<void> {
    if (undefined === this._issuer.metadata.authorization_endpoint || !page.url().startsWith(this._issuer.metadata.authorization_endpoint) || -1 === page.url().indexOf("ims"))
      return;

    await page.waitForSelector("#identifierInput");
    await page.type("#identifierInput", this._user.email);

    await page.waitForSelector(".allow");

    await Promise.all([
      page.waitForNavigation({
        // Need to wait for 'load' here instead of using 'networkidle2' because during a federated login there is a second redirect. With a fast connection,
        // the redirect happens so quickly it doesn't hit the 500 ms threshold that puppeteer expects for an idle network.
        waitUntil: "load",
      }),
      page.$eval(".allow", (button: any) => button.click()),
    ]);

    // Cut out for federated sign-in
    if (-1 !== page.url().indexOf("microsoftonline"))
      return;

    await page.waitForSelector("#password");
    await page.type("#password", this._user.password);

    await Promise.all([
      page.waitForNavigation({
        // Need to wait for 'load' here instead of using 'networkidle2' because during a federated login there is a second redirect. With a fast connection,
        // the redirect happens so quickly it doesn't hit the 500 ms threshold that puppeteer expects for an idle network.
        waitUntil: "load",
      }),
      page.$eval(".allow", (button: any) => button.click()),
    ]);

    // Check if there were any errors when performing sign-in
    await this.checkErrorOnPageByClassName(page, "ping-error");
  }

  // Bentley-specific federated login.  This will get called if a redirect to a url including "wsfed".
  private async handleFederatedSignin(page: puppeteer.Page): Promise<void> {
    if (-1 === page.url().indexOf("wsfed"))
      return;

    if (await this.checkSelectorExists(page, "#i0116")) {
      await page.type("#i0116", this._user.email);
      await Promise.all([
        page.waitForNavigation({
          timeout: 60000,
          waitUntil: "networkidle2",
        }),
        page.$eval("#idSIButton9", (button: any) => button.click()),
      ]);

      // For federated login, there are 2 pages in a row.  The one to load to the redirect page (i.e. "Taking you to your organization's sign-in page...")
      // and then actually loading to the page with the forms for sign-in.

      await page.waitForNavigation({ waitUntil: "networkidle2" }); // Waits for the actual sign-in page to load.

      // Checks for the error in username entered
      await this.checkErrorOnPage(page, "#usernameError");
    } else {
      await page.waitForSelector("[name=UserName]");
      await page.type("[name=UserName]", this._user.email);
    }

    await page.waitForSelector("#passwordInput");
    await page.type("#passwordInput", this._user.password);

    await Promise.all([
      page.waitForNavigation({
        timeout: 60000,
        waitUntil: "networkidle2",
      }),
      page.$eval("#submitButton", (button: any) => button.click()),
    ]);

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
    if (-1 !== page.url().indexOf("microsoftonline") && await this.checkSelectorExists(page, "#idSIButton9")) {
      await Promise.all([
        page.waitForNavigation({
          timeout: 60000,
          waitUntil: "networkidle2",
        }),
        page.$eval("#idSIButton9", (button: any) => button.click()),
      ]);
    }

    await page.waitForNavigation({ waitUntil: "networkidle2" });
  }

  // AzureAD specific login.
  private async handleAzureADSignin(page: puppeteer.Page): Promise<void> {
    if (undefined === this._issuer.metadata.authorization_endpoint || !page.url().startsWith(this._issuer.metadata.authorization_endpoint) || -1 === page.url().indexOf("microsoftonline"))
      return;

    // Verify username selector exists
    if (!(await this.checkSelectorExists(page, "#i0116")))
      throw new Error("Username field does not exist");

    // Type username and wait for navigation
    await page.type("#i0116", this._user.email);
    await page.$eval("#idSIButton9", (button: any) => button.click());
    await Promise.all([
      page.$eval("#idSIButton9", (button: any) => button.click()),
      page.waitForNavigation({
        timeout: 60000,
        waitUntil: ["networkidle0"], // Need to wait longer
      }),
    ]);

    // Verify password selector exists
    if (!(await this.checkSelectorExists(page, "#i0118")))
      throw new Error("Password field does not exist");

    // Type password and wait for navigation
    await page.waitForTimeout(2000); // Seems like we have to wait before typing the password otherwise it does not get registered
    await page.type("#i0118", this._user.password);
    await Promise.all([
      page.$eval("#idSIButton9", (button: any) => button.click()),
      page.waitForNavigation({
        timeout: 60000,
        waitUntil: ["networkidle0"], // Need to wait longer
      }),
    ]);

    // Accept stay signed-in page and complete sign in
    await Promise.all([
      page.waitForNavigation({
        timeout: 60000,
        waitUntil: ["networkidle0"], // Need to wait longer
      }),
      page.$eval("#idSIButton9", (button: any) => button.click()),
    ]);
  }

  // Authing specific login.
  private async handleAuthingSignin(page: puppeteer.Page): Promise<void> {
    if (undefined === this._issuer.metadata.authorization_endpoint || -1 === page.url().indexOf("authing"))
      return;

    // Verify username selector exists
    if (!(await this.checkSelectorExists(page, "#identity")))
      throw new Error("Username field does not exist");

    // Verify password selector exists
    if (!(await this.checkSelectorExists(page, "#password")))
      throw new Error("Password field does not exist");

    // Verify log in button exists
    const button = await page.$x("//button[contains(@class,'authing-login-btn')]");
    if (!button || button.length === 0)
      throw new Error("Log in button does not exist");

    // Type username and password
    await page.type("#identity", this._user.email);
    await page.type("#password", this._user.password);

    // Log in and navigate
    await Promise.all([
      page.waitForNavigation({
        timeout: 60000,
        waitUntil: ["networkidle0"], // Need to wait longer
      }),
      button[0].click(),
    ]);
  }

  private async handleConsentPage(page: puppeteer.Page): Promise<void> {
    const consentUrl = new URL("/consent", this._issuer.issuer as string);
    if (page.url().startsWith(consentUrl.toString()))
      await page.click("button[value=yes]");

    // New consent page acceptance
    if (await page.title() === "Request for Approval") {
      await page.waitForSelector(".allow");

      await Promise.all([
        page.waitForNavigation({
          timeout: 60000,
          waitUntil: "networkidle2",
        }),
        page.$eval(".allow", (button: any) => button.click()),
      ]);
    } else if (await page.title() === "Permissions") { // Another new consent page...
      await page.waitForXPath("(//button/span[text()='Accept'] | //div[contains(@class, 'ping-buttons')]/a[text()='Accept'])[1]");

      const acceptButton = await page.$x("(//button/span[text()='Accept'] | //div[contains(@class, 'ping-buttons')]/a[text()='Accept'])[1]");

      await Promise.all([
        page.waitForNavigation({
          timeout: 60000,
          waitUntil: "networkidle2",
        }),
        acceptButton[0].click(),
      ]);
    }
  }

  private async checkSelectorExists(page: puppeteer.Page, selector: string): Promise<boolean> {
    return page.evaluate((s) => {
      return null !== document.querySelector(s);
    }, selector);
  }

  private async checkErrorOnPage(page: puppeteer.Page, selector: string): Promise<void> {
    const errMsgText = await page.evaluate((s) => {
      const errMsgElement = document.querySelector(s);
      if (null === errMsgElement)
        return undefined;
      return errMsgElement.textContent;
    }, selector);

    if (undefined !== errMsgText && null !== errMsgText)
      throw new Error(errMsgText);
  }

  private async checkErrorOnPageByClassName(page: puppeteer.Page, className: string): Promise<void> {
    const errMsgText = await page.evaluate((s) => {
      const elements = document.getElementsByClassName(s);
      if (0 === elements.length || undefined === elements[0].innerHTML)
        return undefined;
      return elements[0].innerHTML;
    }, className);

    if (undefined !== errMsgText && null !== errMsgText)
      throw new Error(errMsgText);
  }
}

/**
 * Gets an OIDC token for testing.
 * - this is only to be used in test environments, and **never** in production code.
 * - causes authorization to happen by spawning a headless browser, and automatically filling in the supplied user credentials
 * @param config Oidc configuration
 * @param user User
 * @param deploymentRegion Deployment region. If unspecified, it's inferred from configuration, or simply defaults to "0" for PROD use
 * @alpha
 */
export async function getTestAccessToken(config: TestBrowserAuthorizationClientConfiguration, user: TestUserCredentials): Promise<AccessToken | undefined> {
  const client = new TestBrowserAuthorizationClient(config, user);
  return client.getAccessToken();
}
