/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

import * as Http from "http";
import * as open from "open";
import { assert, AuthStatus, BeEvent, BentleyError, Logger } from "@itwin/core-bentley";
import {
  AuthorizationError, AuthorizationNotifier, AuthorizationRequest, AuthorizationRequestHandler, AuthorizationResponse,
  AuthorizationServiceConfiguration, BaseTokenRequestHandler, BasicQueryStringUtils, GRANT_TYPE_AUTHORIZATION_CODE, GRANT_TYPE_REFRESH_TOKEN,
  TokenRequest,
} from "@openid/appauth";
import { NodeCrypto, NodeRequestor } from "@openid/appauth/built/node_support";
import { TokenStore } from "./TokenStore";

import type { AccessToken } from "@itwin/core-bentley";
import type { AuthorizationClient } from "@itwin/core-common";

import type {
  AuthorizationErrorJson, AuthorizationRequestJson, AuthorizationRequestResponse, AuthorizationResponseJson, TokenRequestHandler,
  TokenRequestJson, TokenResponse,
} from "@openid/appauth";

/**
 * Logger category used in this package
 * @public
 */
export const NODE_CLI_AUTH_LOGGER_CATEGORY = "node-cli-auth";

/**
 * Client configuration to generate OIDC/OAuth tokens for command-line applications
 * @public
 */
export interface NodeCliAuthorizationConfiguration {
  /** The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined. */
  readonly issuerUrl?: string;
  /**
   * Upon signing in, the client application receives a response from the Bentley IMS OIDC/OAuth2 provider at this URI
   * For this client, must start with `http://localhost:${redirectPort}`
   * Defaults to "http://localhost:3000/signin-callback" if undefined.
   */
  readonly redirectUri?: string;
  /** Client application's identifier as registered with the OIDC/OAuth2 provider. */
  readonly clientId: string;
  /** List of space separated scopes to request access to various resources. */
  readonly scope: string;
  /**
   * Time in seconds that's used as a buffer to check the token for validity/expiry.
   * The checks for authorization, and refreshing access tokens all use this buffer - i.e., the token is considered expired if the current time is within the specified
   * time of the actual expiry.
   * @note If unspecified this defaults to 10 minutes.
   */
  readonly expiryBuffer?: number;
}

/**
 * Utility to generate OIDC/OAuth tokens for command-line applications
 * This client is intended for developer tooling and does not aspire to provide the full set of functionality
 * needed for a user-facing app.
 * @public
 */
export class NodeCliAuthorizationClient implements AuthorizationClient {
  private _accessToken: AccessToken = "";

  private _bakedConfig: BakedAuthorizationConfiguration;

  private _tokenStore: TokenStore;
  private _configuration?: AuthorizationServiceConfiguration;
  private _tokenResponse?: TokenResponse;
  private _expiresAt?: Date;

  private readonly _onAccessTokenSet = new BeEvent();

  public constructor(config: NodeCliAuthorizationConfiguration) {
    this._bakedConfig = new BakedAuthorizationConfiguration(config);

    const appStorageKey = `Bentley.iTwinJs.OidcTokenStore.${this._bakedConfig.clientId}`;
    this._tokenStore = new TokenStore(appStorageKey);
  }

  /**
   * Returns a promise that resolves to the AccessToken of the currently authorized user.
   * The AccessToken is refreshed as necessary.
   * If signIn hasn't been called, the AccessToken will remain empty.
   */
  public async getAccessToken(): Promise<AccessToken> {
    if (!this._configuration) {
      Logger.logError(NODE_CLI_AUTH_LOGGER_CATEGORY, "getAccessToken called but not initialized. Call signIn first");
      return "";
    }

    // If we already acquired an AccessToken, make sure it's current
    if (this._tokenResponse?.refreshToken !== undefined && this._expiresAt !== undefined) {
      const hasExpired = (this._expiresAt.getTime() - Date.now()) <= this._bakedConfig.expiryBuffer * 1000;
      if (hasExpired) {
        const refreshTokenResponse = await this.makeRefreshAccessTokenRequest(this._tokenResponse.refreshToken);
        await this.setTokenResponse(refreshTokenResponse);
      }
    }

    return this._accessToken;
  }

  /**
   * Attempts to authorize the current user, and resolves when the authorization process is complete.
   * Once the returned promises resolves, getAccessToken will return a valid AccessToken.
   * @note On Windows and MacOS, this will cache the refreshToken in secure storage to reduce the frequency of interactive sign-in.
   * @note This function succeeds only if the user authorizes your application. If the user never clicks Accept, no feedback is provided.
   */
  public async signIn() {
    await this.initialize();

    await this.loadAndRefreshAccessToken();
    if (this._accessToken !== "") // Will be defined if AccessToken was successfully loaded from store
      return;

    return new Promise<void>((resolve, reject) => {
      this._onAccessTokenSet.addOnce(() => resolve());
      this.beginSignIn().catch((reason) => {
        this._onAccessTokenSet.clear();
        reject(reason);
      });
    });
  }

  private async initialize() {
    // Would ideally set up in constructor, but async...
    if (!this._configuration)
      this._configuration = await AuthorizationServiceConfiguration.fetchFromIssuer(this._bakedConfig.issuerUrl, new NodeRequestor());
  }

  private async loadAndRefreshAccessToken() {
    const storedTokenResponse = await this._tokenStore.load();
    if (storedTokenResponse?.refreshToken === undefined)
      return;

    const newTokenResponse = await this.makeRefreshAccessTokenRequest(storedTokenResponse.refreshToken);
    Logger.logTrace(NODE_CLI_AUTH_LOGGER_CATEGORY, "Refresh token completed, and issued access token");
    await this.setTokenResponse(newTokenResponse);
  }

  private async setTokenResponse(tokenResponse: TokenResponse) {
    const accessToken = tokenResponse.accessToken;
    this._tokenResponse = tokenResponse;
    const expiresAtMilliseconds = (tokenResponse.issuedAt + (tokenResponse.expiresIn ?? 0)) * 1000;
    this._expiresAt = new Date(expiresAtMilliseconds);

    await this._tokenStore.save(this._tokenResponse);

    const bearerToken = `${tokenResponse.tokenType} ${accessToken}`;
    this._accessToken = bearerToken;

    this._onAccessTokenSet.raiseEvent();
  }

  private async beginSignIn() {
    if (!this._configuration)
      throw new BentleyError(AuthStatus.Error, "Bug in NodeCliAuthorization client - _configuration not defined");

    const authReqJson: AuthorizationRequestJson = {
      /* eslint-disable @typescript-eslint/naming-convention */
      client_id: this._bakedConfig.clientId,
      redirect_uri: this._bakedConfig.redirectUri,
      scope: this._bakedConfig.scopes,
      response_type: AuthorizationRequest.RESPONSE_TYPE_CODE,
      extras: { prompt: "consent", access_type: "offline" },
      /* eslint-enable @typescript-eslint/naming-convention */
    };
    const authorizationRequest = new AuthorizationRequest(authReqJson, new NodeCrypto(), true /* = usePkce */);
    await authorizationRequest.setupCodeVerifier();

    const authorizationEvents = new NodeCliAuthorizationEvents();
    this.startLoopbackWebServer(this._bakedConfig.redirectUri, authorizationRequest.state, authorizationEvents);

    const authorizationHandler = new NodeCliAuthorizationRequestHandler(authorizationEvents);
    const notifier = new AuthorizationNotifier();
    authorizationHandler.setAuthorizationNotifier(notifier);
    notifier.setAuthorizationListener(async (authRequest: AuthorizationRequest, authResponse: AuthorizationResponse | null, authError: AuthorizationError | null) => {
      Logger.logTrace(NODE_CLI_AUTH_LOGGER_CATEGORY, "Authorization listener invoked", () => ({ authRequest, authResponse, authError }));

      const tokenResponse = await this.handleAuthorizationResponse(authRequest, authResponse, authError);
      authorizationEvents.onAuthorizationResponseCompleted.raiseEvent();
      if (tokenResponse)
        await this.setTokenResponse(tokenResponse);
      else
        throw new BentleyError(AuthStatus.Error, "No tokenResponse received from sign-in dialog");
    });

    // Open system browser to perform authorization request
    await authorizationHandler.performAuthorizationRequest(this._configuration, authorizationRequest);
  }

  private async handleAuthorizationResponse(authRequest: AuthorizationRequest, authResponse: AuthorizationResponse | null, authError: AuthorizationError | null): Promise<TokenResponse | undefined> {
    // Phase 1 of login has completed to fetch the authorization code - check for errors
    if (authError) {
      Logger.logError(NODE_CLI_AUTH_LOGGER_CATEGORY, "Authorization error. Unable to get authorization code.", () => authError);
      return undefined;
    }

    if (!authResponse || authResponse.state !== authRequest.state) {
      Logger.logError(NODE_CLI_AUTH_LOGGER_CATEGORY, "Authorization error. Unable to get authorization code", () => ({
        error: "invalid_state",
        errorDescription: "The login response state did not match the login request state.",
      }));
      return undefined;
    }

    // Phase 2: Swap the authorization code for the access token
    assert(authRequest.internal !== undefined);
    assert(this._configuration !== undefined);
    try {
      const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(new NodeRequestor());
      const tokenResponse = await tokenHandler.performTokenRequest(this._configuration, new TokenRequest({
        /* eslint-disable @typescript-eslint/naming-convention */
        grant_type: GRANT_TYPE_AUTHORIZATION_CODE,
        code: authResponse.code,
        redirect_uri: this._bakedConfig.redirectUri,
        client_id: this._bakedConfig.clientId,
        extras: { code_verifier: authRequest.internal.code_verifier },
        /* eslint-enable @typescript-eslint/naming-convention */
      }));
      Logger.logTrace(NODE_CLI_AUTH_LOGGER_CATEGORY, "Authorization completed, and issued access token");
      return tokenResponse;
    } catch (err) {
      Logger.logError(NODE_CLI_AUTH_LOGGER_CATEGORY, `Error performing token request from token handler`, () => BentleyError.getErrorProps(err));
      throw err;
    }
  }

  private async makeRefreshAccessTokenRequest(refreshToken: string): Promise<TokenResponse> {
    if (!this._configuration)
      throw new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()");

    /* eslint-disable @typescript-eslint/naming-convention */
    const tokenRequestJson: TokenRequestJson = {
      grant_type: GRANT_TYPE_REFRESH_TOKEN,
      refresh_token: refreshToken,
      redirect_uri: this._bakedConfig.redirectUri,
      client_id: this._bakedConfig.clientId,
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    const tokenRequest = new TokenRequest(tokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(tokenRequestor);
    return tokenHandler.performTokenRequest(this._configuration, tokenRequest);
  }

  private startLoopbackWebServer(redirectUrl: string, authState: string, authEvents: NodeCliAuthorizationEvents) {
    const onBrowserRequest = (httpRequest: Http.IncomingMessage, httpResponse: Http.ServerResponse) => {
      if (!httpRequest.url)
        return;

      // Parse the request URL to determine the authorization code, state and errors if any
      const redirectedUrl = new URL(httpRequest.url, redirectUrl);
      const searchParams = redirectedUrl.searchParams;

      const state = searchParams.get("state") || undefined;
      if (!state || state !== authState)
        return; // ignore irrelevant requests (e.g. favicon.ico)

      // Notify listeners of the code response or error
      let authorizationResponse: AuthorizationResponseJson | null = null;
      let authorizationError: AuthorizationErrorJson | null = null;
      const error = searchParams.get("error");
      if (error) {
        const errorUri = searchParams.get("error_uri") || undefined;
        const errorDescription = searchParams.get("error_description") || undefined;
        authorizationError = { error, error_description: errorDescription, error_uri: errorUri, state }; // eslint-disable-line @typescript-eslint/naming-convention
        httpResponse.write("<h1>Sign in error!</h1>");
        httpResponse.end();
      } else {
        const code = searchParams.get("code");
        if (!code)
          throw new BentleyError(AuthStatus.Error, "Unexpected failure - AuthorizationResponse is missing a code value");
        authorizationResponse = { code, state };
        httpResponse.writeHead(200, { "Content-Type": "text/html" }); //  eslint-disable-line @typescript-eslint/naming-convention
        httpResponse.write("<h1>Sign in was successful!</h1>You can close this browser window and return to the application");
        httpResponse.end();
      }
      authEvents.onAuthorizationResponse.raiseEvent(authorizationError, authorizationResponse);

      // Stop the web server when the signin attempt has finished
      authEvents.onAuthorizationResponseCompleted.addOnce(() => httpServer.close());
    };

    const httpServer = Http.createServer(onBrowserRequest);
    httpServer.listen(new URL(redirectUrl).port);
  }
}

/**
 * @internal
 */
export class BakedAuthorizationConfiguration {
  public readonly clientId: string;
  public readonly scopes: string;
  public readonly issuerUrl: string;
  public readonly redirectUri: string = "http://localhost:3000/signin-callback";
  public readonly expiryBuffer: number = 60 * 10; // refresh token 10 minutes before real expiration time;

  public constructor(config: NodeCliAuthorizationConfiguration) {
    if (!config.clientId || !config.scope)
      throw new BentleyError(AuthStatus.Error, "Must specify a valid configuration with a clientId and scope when initializing NodeCliAuthorizationClient");

    this.clientId = config.clientId;

    // If offline_access is not included, add it so that we can get a refresh token.
    if (!config.scope.includes("offline_access"))
      this.scopes = `${config.scope} offline_access`;
    else
      this.scopes = config.scope;

    const defaultIssuerUrl = "https://ims.bentley.com";
    let prefix = process.env.IMJS_URL_PREFIX;
    const authority = new URL(config.issuerUrl ?? defaultIssuerUrl);
    if (prefix && !config.issuerUrl) {
      prefix = prefix === "dev-" ? "qa-" : prefix;
      authority.hostname = prefix + authority.hostname;
    }
    this.issuerUrl = authority.href.replace(/\/$/, "");

    if (config.redirectUri)
      this.redirectUri = config.redirectUri;
    if (config.expiryBuffer)
      this.expiryBuffer = config.expiryBuffer;
  }
}

type AuthorizationResponseListener = (error: AuthorizationErrorJson | null, response: AuthorizationResponseJson | null) => void;

class NodeCliAuthorizationEvents {
  public readonly onAuthorizationResponseCompleted = new BeEvent();
  public readonly onAuthorizationResponse = new BeEvent<AuthorizationResponseListener>();
}

class NodeCliAuthorizationRequestHandler extends AuthorizationRequestHandler {
  private _authorizationPromise: Promise<AuthorizationRequestResponse> | null = null;
  private _authorizationEvents: NodeCliAuthorizationEvents;

  public constructor(authorizationEvents: NodeCliAuthorizationEvents) {
    super(new BasicQueryStringUtils(), new NodeCrypto());
    this._authorizationEvents = authorizationEvents;
  }

  public async performAuthorizationRequest(serviceConfiguration: AuthorizationServiceConfiguration, authRequest: AuthorizationRequest): Promise<void> {
    Logger.logTrace(NODE_CLI_AUTH_LOGGER_CATEGORY, "Making authorization request", () => ({ serviceConfiguration, authRequest }));

    // Setup a promise to process the authorization response
    this._authorizationPromise = new Promise<AuthorizationRequestResponse>((resolve, _reject) => {

      // Wrap the response from the web browser (with the authorization code)
      this._authorizationEvents.onAuthorizationResponse.addOnce((authErrorJson: AuthorizationErrorJson | null, authResponseJson: AuthorizationResponseJson | null) => {

        // Resolve the full response including the request
        const authRequestResponse: AuthorizationRequestResponse = {
          request: authRequest,
          error: authErrorJson ? new AuthorizationError(authErrorJson) : null,
          response: authResponseJson ? new AuthorizationResponse(authResponseJson) : null,
        };
        resolve(authRequestResponse);

        // Ask the base class to call our completeAuthorizationRequest - this calls the registered notifier to broadcast the event outside of the client
        this.completeAuthorizationRequestIfPossible(); // eslint-disable-line @typescript-eslint/no-floating-promises
      });
    });

    // Compose the request and invoke in the browser
    const authUrl = this.buildRequestUrl(serviceConfiguration, authRequest);
    await open(authUrl);
  }

  /**
   * Checks if an authorization flow can be completed, and completes it.
   * The handler returns a `Promise<AuthorizationRequestResponse>` if ready, or a `Promise<null>`
   * if not ready.
   */
  protected async completeAuthorizationRequest(): Promise<AuthorizationRequestResponse | null> {
    return this._authorizationPromise;
  }
}
