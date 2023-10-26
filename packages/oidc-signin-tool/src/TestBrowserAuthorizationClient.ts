/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import type { AccessToken } from "@itwin/core-bentley";
import { BeEvent } from "@itwin/core-bentley";
import type { AuthorizationClient } from "@itwin/core-common";
import { OIDCDiscoveryClient } from "@itwin/service-authorization";
import { InMemoryWebStorage, OidcClient, WebStorageStateStore } from "oidc-client-ts";
import type {
  TestBrowserAuthorizationClientConfiguration,
  TestUserCredentials,
} from "./TestUsers";
import * as SignInAutomation from "./SignInAutomation";

/**
 * Implementation of AuthorizationClient used for the iModel.js integration tests.
 * - this is only to be used in test environments, and **never** in production code.
 * - use static create method to create an authorization client for the specified user credentials.
 * - calling getAccessToken() the first time, or after token expiry, causes the authorization to happen by
 *   spawning a headless browser, and automatically filling in the supplied user credentials.
 * @alpha
 */
export class TestBrowserAuthorizationClient implements AuthorizationClient {
  private _discoveryClient: OIDCDiscoveryClient;
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

    this._discoveryClient = new OIDCDiscoveryClient(config.authority);
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
    const config = await this._discoveryClient.getConfig();

    // eslint-disable-next-line no-console
    console.log(`Starting OIDC signin for ${this._user.email} ...`);

    /* eslint-disable @typescript-eslint/naming-convention */
    const oidcClient = new OidcClient({
      redirect_uri: this._config.redirectUri,
      authority: config.issuer,
      client_id: this._config.clientId,
      stateStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
      scope: this._config.scope,
      metadata: config,
    });

    // this is only async because it _could_ use AsyncStorage browser API.
    // We replaced it with InMemoryWebStorage so everything is synchronous under the hood.
    const signInRequest = await oidcClient.createSigninRequest({
      request_type: "si:r",
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    const controller = new AbortController();

    const page = await SignInAutomation.launchDefaultAutomationPage();

    const oidcConfig = await this._discoveryClient.getConfig();

    await SignInAutomation.automatedSignIn({
      page,
      signInInitUrl: signInRequest.url,
      user: this._user,
      config: {
        issuer: oidcConfig.issuer,
        authorizationEndpoint: oidcConfig.authorization_endpoint,
      },
      abortController: controller,

      // Eventually, we'll get a redirect to the callback url
      // including the params we need to retrieve a token
      // This varies depending on the type of user, so start
      // waiting now and resolve at the end of the "sign in pipeline"
      waitForCallback: page.waitForRequest((req) =>
        req.url().startsWith(this._config.redirectUri) || controller.signal.aborted
      ).then((resp) => resp.url()),

      resultFromCallback: async (callbackUrl) => {
        const tokenSet = await oidcClient.processSigninResponse(callbackUrl);
        this._accessToken = `Bearer ${tokenSet.access_token}`,
        this._expiresAt = tokenSet.expires_at !== undefined
          ? new Date(tokenSet.expires_at * 1000)
          : undefined;
      },
    });
  }

  public async signOut(): Promise<void> {
    this._accessToken = "";
    this.onAccessTokenChanged.raiseEvent(this._accessToken);
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
