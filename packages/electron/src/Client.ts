/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

/** @packageDocumentation
 * @module Authentication
 */

// cSpell:ignore openid appauth signin Pkce Signout
/* eslint-disable @typescript-eslint/naming-convention */

import { AccessToken, assert, AuthStatus, BentleyError, Logger } from "@itwin/core-bentley";
import { NativeHost } from "@itwin/core-backend";
import { AuthorizationClient, IModelError, NativeAppAuthorizationConfiguration } from "@itwin/core-common";
import * as deepAssign from "deep-assign";
import { request, RequestOptions } from "@bentley/itwin-client";
import {
  AuthorizationError, AuthorizationNotifier, AuthorizationRequest, AuthorizationRequestJson, AuthorizationResponse, AuthorizationServiceConfiguration,
  BaseTokenRequestHandler, GRANT_TYPE_AUTHORIZATION_CODE, GRANT_TYPE_REFRESH_TOKEN, RevokeTokenRequest, RevokeTokenRequestJson, StringMap,
  TokenRequest, TokenRequestHandler, TokenRequestJson, TokenResponse,
} from "@openid/appauth";
import { NodeCrypto, NodeRequestor } from "@openid/appauth/built/node_support";
import { ElectronAuthorizationEvents } from "./Events";
import { ElectronAuthorizationRequestHandler } from "./ElectronAuthorizationRequestHandler";
import { ElectronTokenStore } from "./TokenStore";
import { LoopbackWebServer } from "./LoopbackWebServer";

import * as https from "https";

const loggerCategory = "electron-auth";
export class DefaultRequestOptionsProvider {
  protected _defaultOptions: RequestOptions;
  /** Creates an instance of DefaultRequestOptionsProvider and sets up the default options. */
  constructor() {
    this._defaultOptions = {
      method: "GET",
      useCorsProxy: false,
    };
  }

  /**
   * Augments options with the provider's default values.
   * @note The options passed in override any defaults where necessary.
   * @param options Options that should be augmented.
   */
  public async assignOptions(options: RequestOptions): Promise<void> {
    const clonedOptions: RequestOptions = { ...options };
    deepAssign(options, this._defaultOptions);
    deepAssign(options, clonedOptions); // ensure the supplied options override the defaults
  }
}

/** @beta */
export class RequestGlobalOptions {
  public static httpsProxy?: https.Agent = undefined;
  /** Creates an agent for any user defined proxy using the supplied additional options. Returns undefined if user hasn't defined a proxy.
   * @internal
   */
  public static createHttpsProxy: (additionalOptions?: https.AgentOptions) => https.Agent | undefined = (_additionalOptions?: https.AgentOptions) => undefined;
  public static maxRetries: number = 4;
  public static timeout: RequestTimeoutOptions = {
    deadline: 25000,
    response: 10000,
  };
  // Assume application is online or offline. This hint skip retry/timeout
  public static online: boolean = true;
}

/** @beta */
export interface RequestTimeoutOptions {
  /** Sets a deadline (in milliseconds) for the entire request (including all uploads, redirects, server processing time) to complete.
   * If the response isn't fully downloaded within that time, the request will be aborted
   */
  deadline?: number;

  /** Sets maximum time (in milliseconds) to wait for the first byte to arrive from the server, but it does not limit how long the entire
   * download can take. Response timeout should be at least few seconds longer than just the time it takes the server to respond, because
   * it also includes time to make DNS lookup, TCP/IP and TLS connections, and time to upload request data.
   */
  response?: number;
}

// Don't expose any of the 'Client' methods

/**
 * Utility to generate OIDC/OAuth tokens for Desktop Applications
 * @beta
 */
export class ElectronAuthorizationClient implements AuthorizationClient { // TODO: Make sure to do ImsAuthorizationCLient
  public static defaultRedirectUri = "http://localhost:3000/signin-callback";
  private _configuration: AuthorizationServiceConfiguration | undefined;
  private _tokenResponse: TokenResponse | undefined;
  private _tokenStore?: ElectronTokenStore;
  private _expiresAt?: Date;
  public get tokenStore() { return this._tokenStore!; }

  protected _accessToken: AccessToken = "";
  public config?: NativeAppAuthorizationConfiguration;
  public expireSafety = 60 * 10; // refresh token 10 minutes before real expiration time
  public issuerUrl?: string;

  public static readonly searchKey: string = "IMSOpenID";

  private static _defaultRequestOptionsProvider: DefaultRequestOptionsProvider;
  protected _url?: string;
  protected baseUrl?: string;

  public static readonly configResolveUrlUsingRegion = "IMJS_BUDDI_RESOLVE_URL_USING_REGION";

  public constructor(config?: NativeAppAuthorizationConfiguration) {
    this._url = process.env.IMJS_ITWIN_PLATFORM_AUTHORITY;
    this.config = config;
  }

  // ------  Client.ts ------

  protected async setupOptionDefaults(options: RequestOptions): Promise<void> {
    if (!ElectronAuthorizationClient._defaultRequestOptionsProvider)
      ElectronAuthorizationClient._defaultRequestOptionsProvider = new DefaultRequestOptionsProvider();
    return ElectronAuthorizationClient._defaultRequestOptionsProvider.assignOptions(options);
  }

  // DELETE
  /**
   * Gets name/key to query the service URLs from the URL Discovery Service ("Buddi")
   * @returns Search key for the URL.
   */
  protected getUrlSearchKey(): string {
    return ElectronAuthorizationClient.searchKey;
  }

  public async getUrl(): Promise<string> {
    if (this._url)
      return this._url;

    if (this.baseUrl) {
      let prefix = process.env.IMJS_URL_PREFIX;

      // Need to ensure the usage of the previous IMJS_BUDDI_RESOLVE_URL_USING_REGION to not break any
      // existing users relying on the behavior.
      // This needs to be removed...
      if (undefined === prefix) {
        const region = process.env.IMJS_BUDDI_RESOLVE_URL_USING_REGION;
        switch (region) {
          case "102":
            prefix = "qa-";
            break;
          case "103":
            prefix = "dev-";
            break;
        }
      }

      if (prefix && !process.env.IMJS_ITWIN_PLATFORM_AUTHORITY) {
        const baseUrl = new URL(this.baseUrl);
        baseUrl.hostname = prefix + baseUrl.hostname;
        this._url = baseUrl.href;
      } else {
        this._url = this.baseUrl;
      }
      return this._url;
    }

    const searchKey: string = this.getUrlSearchKey();
    try {
      const url = await this.discoverUrl(searchKey, undefined);
      this._url = url;
    } catch (error) {
      throw new Error(`Failed to discover URL for service identified by "${searchKey}"`);
    }

    return this._url;
  }

  // DELETE (and anything with buddi)
  public async discoverUrl(searchKey: string, regionId: number | undefined): Promise<string> {

    const urlBase: string = await this.getUrl();
    const url: string = `${urlBase}/GetUrl/`;
    // const resolvedRegion = typeof regionId !== "undefined" ? regionId : process.env[UrlDiscoveryClient.configResolveUrlUsingRegion] ? Number(process.env[UrlDiscoveryClient.configResolveUrlUsingRegion]) : 0;
    const options: RequestOptions = {
      method: "GET",
      qs: {
        url: searchKey,
        // region: resolvedRegion,
      },
    };

    await this.setupOptionDefaults(options);

    // const response: Response = await request(requestContext, url, options);

    // const discoveredUrl: string = response.body.result.url.replace(/\/$/, ""); // strip trailing "/" for consistency
    // return discoveredUrl;
    return url + regionId;
  }

  protected async delete(accessToken: AccessToken, relativeUrlPath: string): Promise<void> {
    const url: string = await this.getUrl() + relativeUrlPath;
    Logger.logInfo(loggerCategory, "Sending DELETE request", () => ({ url }));
    const options: RequestOptions = {
      method: "DELETE",
      headers: { authorization: accessToken },
    };
    await this.setupOptionDefaults(options);
    await request(url, options);
    Logger.logTrace(loggerCategory, "Successful DELETE request", () => ({ url }));
  }

  /** Configures request options based on user defined values in HttpRequestOptions */
  protected applyUserConfiguredHttpRequestOptions(requestOptions: RequestOptions, userDefinedRequestOptions?: RequestOptions): void {
    if (!userDefinedRequestOptions)
      return;

    if (userDefinedRequestOptions.headers) {
      requestOptions.headers = { ...requestOptions.headers, ...userDefinedRequestOptions.headers };
    }

    if (userDefinedRequestOptions.timeout) {
      this.applyUserConfiguredTimeout(requestOptions, userDefinedRequestOptions.timeout);
    }
  }

  /** Sets the request timeout based on user defined values */
  private applyUserConfiguredTimeout(requestOptions: RequestOptions, userDefinedTimeout: RequestTimeoutOptions): void {
    requestOptions.timeout = { ...requestOptions.timeout };

    if (userDefinedTimeout.response)
      requestOptions.timeout.response = userDefinedTimeout.response;

    if (userDefinedTimeout.deadline)
      requestOptions.timeout.deadline = userDefinedTimeout.deadline;
    else if (userDefinedTimeout.response) {
      const defaultNetworkOverheadBuffer = (RequestGlobalOptions.timeout.deadline as number) - (RequestGlobalOptions.timeout.response as number);
      requestOptions.timeout.deadline = userDefinedTimeout.response + defaultNetworkOverheadBuffer;
    }
  }

  // ------ END Client.ts ------

  // ------ NativeAppAuthorizationBackend ------

  /**
   * Used to initialize the client - must be awaited before any other methods are called.
   * The call attempts a silent sign-if possible.
   */
  public async initialize(config?: NativeAppAuthorizationConfiguration): Promise<void> {
    this.config = config ?? this.config;
    if (!this.config)
      throw new IModelError(AuthStatus.Error, "Must specify a valid configuration when initializing authorization");
    if (this.config.expiryBuffer)
      this.expireSafety = this.config.expiryBuffer;
    this.issuerUrl = this.config.issuerUrl ?? await this.getUrl();

    assert(this.config !== undefined && this.issuerUrl !== undefined, "URL of authorization provider was not initialized");

    this._tokenStore = new ElectronTokenStore(this.config.clientId);

    const tokenRequestor = new NodeRequestor(); // the Node.js based HTTP client
    this._configuration = await AuthorizationServiceConfiguration.fetchFromIssuer(this.issuerUrl, tokenRequestor);
    Logger.logTrace(loggerCategory, "Initialized service configuration", () => ({ configuration: this._configuration }));

    // Attempt to load the access token from store
    await this.loadAccessToken();
  }

  public setAccessToken(token: AccessToken) {
    if (token === this._accessToken)
      return;
    this._accessToken = token;
    NativeHost.onAccessTokenChanged.raiseEvent(token);
  }

  // ------ END NativeAppAuthorizationBackend ------

  public get redirectUri() { return this.config?.redirectUri ?? ElectronAuthorizationClient.defaultRedirectUri; }

  public async refreshToken(): Promise<AccessToken> {
    if (this._tokenResponse === undefined || this._tokenResponse.refreshToken === undefined)
      return "";

    const token = `Bearer ${this._tokenResponse.refreshToken}`; // Is this right? should we append bearer to refresh token?
    return this.refreshAccessToken(token);
  }

  /** Loads the access token from the store, and refreshes it if necessary and possible
   * @return AccessToken if it's possible to get a valid access token, and undefined otherwise.
   */
  private async loadAccessToken(): Promise<AccessToken> {
    const tokenResponse = await this.tokenStore.load();
    if (tokenResponse === undefined || tokenResponse.refreshToken === undefined)
      return "";
    try {
      return await this.refreshAccessToken(tokenResponse.refreshToken);
    } catch (err) {
      Logger.logError(loggerCategory, `Error refreshing access token`, () => err);
      return "";
    }
  }

  /**
   * Sign-in completely.
   * This is a wrapper around [[signIn]] - the only difference is that the promise resolves
   * with the access token after sign in is complete and successful.
   */
  public async signInComplete(): Promise<AccessToken> {
    return new Promise<AccessToken>((resolve, reject) => {
      // NativeHost.onAccessTokenChanged.addOnce((token) => {
      //   if (token !== "") {
      //     resolve(token);
      //   } else {
      //     reject(new Error("Failed to sign in"));
      //   }
      // });
      this.signIn().catch((err) => reject(err));
      resolve("");
    });
  }

  /**
   * Start the sign-in process
   * - calls the onAccessTokenChanged() call back after the authorization completes
   * or if there is an error.
   * - will attempt in order:
   *   (i) load any existing authorized user from storage,
   *   (ii) an interactive signin that requires user input.
   */
  public async signIn(): Promise<void> {
    if (!this._configuration)
      throw new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()");
    assert(this.config !== undefined);

    // Attempt to load the access token from store
    const token = await this.loadAccessToken();
    if (token)
      return this.setAccessToken(token);

    // Create the authorization request
    const nativeConfig = this.config;
    const authReqJson: AuthorizationRequestJson = {
      client_id: nativeConfig.clientId,
      redirect_uri: this.redirectUri,
      scope: nativeConfig.scope,
      response_type: AuthorizationRequest.RESPONSE_TYPE_CODE,
      extras: { prompt: "consent", access_type: "offline" },
    };
    const authorizationRequest = new AuthorizationRequest(authReqJson, new NodeCrypto(), true /* = usePkce */);
    await authorizationRequest.setupCodeVerifier();

    // Create events for this signin attempt
    const authorizationEvents = new ElectronAuthorizationEvents();

    // Ensure that completion callbacks are correlated to the correct authorization request
    LoopbackWebServer.addCorrelationState(authorizationRequest.state, authorizationEvents);

    // Start a web server to listen to the browser requests
    LoopbackWebServer.start(nativeConfig);

    const authorizationHandler = new ElectronAuthorizationRequestHandler(authorizationEvents);

    // Setup a notifier to obtain the result of authorization
    const notifier = new AuthorizationNotifier();
    authorizationHandler.setAuthorizationNotifier(notifier);
    notifier.setAuthorizationListener(async (authRequest: AuthorizationRequest, authResponse: AuthorizationResponse | null, authError: AuthorizationError | null) => {
      Logger.logTrace(loggerCategory, "Authorization listener invoked", () => ({ authRequest, authResponse, authError }));

      const tokenResponse = await this._onAuthorizationResponse(authRequest, authResponse, authError);

      authorizationEvents.onAuthorizationResponseCompleted.raiseEvent(authError ? authError : undefined);

      if (!tokenResponse)
        await this.clearTokenResponse();
      else
        await this.setTokenResponse(tokenResponse);
    });

    // Start the signin
    await authorizationHandler.performAuthorizationRequest(this._configuration, authorizationRequest);
  }

  private async _onAuthorizationResponse(authRequest: AuthorizationRequest, authResponse: AuthorizationResponse | null, authError: AuthorizationError | null): Promise<TokenResponse | undefined> {

    // Phase 1 of login has completed to fetch the authorization code - check for errors
    if (authError) {
      Logger.logError(loggerCategory, "Authorization error. Unable to get authorization code.", () => authError);
      return undefined;
    }

    if (!authResponse || authResponse.state !== authRequest.state) {
      Logger.logError(loggerCategory, "Authorization error. Unable to get authorization code", () => ({
        error: "invalid_state",
        errorDescription: "The login response state did not match the login request state.",
      }));
      return undefined;
    }

    // Phase 2: Swap the authorization code for the access token
    const tokenResponse = await this.swapAuthorizationCodeForTokens(authResponse.code, authRequest.internal!.code_verifier);
    Logger.logTrace(loggerCategory, "Authorization completed, and issued access token");
    return tokenResponse;
  }

  /**
   * Start the sign-out process
   * - calls the onAccessTokenChanged() call back after the authorization completes
   *   or if there is an error.
   * - redirects application to the postSignoutRedirectUri specified in the configuration when the sign out is
   *   complete
   */
  public async signOut(): Promise<void> {
    await this.makeRevokeTokenRequest();
  }

  /**
   * Sign out completely
   * This is a wrapper around [[signOut]] - the only difference is that the promise resolves
   * after the sign out is complete.
   */
  public async signOutComplete(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      NativeHost.onAccessTokenChanged.addOnce((token) => {
        if (token === "") {
          resolve();
        } else {
          reject(new Error("Failed to sign out"));
        }
      });
      this.signOut().catch((err) => reject(err));
    });
  }

  private async clearTokenResponse() {
    this._tokenResponse = undefined;
    await this.tokenStore.delete();
    this.setAccessToken("");
  }

  private async setTokenResponse(tokenResponse: TokenResponse): Promise<AccessToken> {
    const accessToken = tokenResponse.accessToken;
    this._tokenResponse = tokenResponse;
    const expiresAtMilliseconds = (tokenResponse.issuedAt + (tokenResponse.expiresIn ?? 0)) * 1000;
    this._expiresAt = new Date(expiresAtMilliseconds);

    await this.tokenStore.save(this._tokenResponse);
    this.setAccessToken(accessToken);
    return accessToken;
  }

  private get _hasExpired(): boolean {
    if (!this._expiresAt)
      return false;

    return this._expiresAt.getTime() - Date.now() <= 1 * 60 * 1000; // Consider 1 minute before expiry as expired
  }

  public async getAccessToken(): Promise<AccessToken> {
    if (this._hasExpired || !this._accessToken)
      this.setAccessToken(await this.refreshToken());
    return this._accessToken;
  }

  private async refreshAccessToken(refreshToken: string): Promise<AccessToken> {
    const tokenResponse = await this.makeRefreshAccessTokenRequest(refreshToken);
    Logger.logTrace(loggerCategory, "Refresh token completed, and issued access token");
    return this.setTokenResponse(tokenResponse);
  }

  /** Swap the authorization code for a refresh token and access token */
  private async swapAuthorizationCodeForTokens(authCode: string, codeVerifier: string): Promise<TokenResponse> {
    if (!this._configuration)
      throw new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()");
    assert(this.config !== undefined);

    const nativeConfig = this.config;
    const extras: StringMap = { code_verifier: codeVerifier };
    const tokenRequestJson: TokenRequestJson = {
      grant_type: GRANT_TYPE_AUTHORIZATION_CODE,
      code: authCode,
      redirect_uri: this.redirectUri,
      client_id: nativeConfig.clientId,
      extras,
    };

    const tokenRequest = new TokenRequest(tokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(tokenRequestor);
    return tokenHandler.performTokenRequest(this._configuration, tokenRequest);
  }

  private async makeRefreshAccessTokenRequest(refreshToken: string): Promise<TokenResponse> {
    if (!this._configuration)
      throw new BentleyError(AuthStatus.Error, "Not initialized. First call initialize()");
    assert(this.config !== undefined);

    const tokenRequestJson: TokenRequestJson = {
      grant_type: GRANT_TYPE_REFRESH_TOKEN,
      refresh_token: refreshToken,
      redirect_uri: this.redirectUri,
      client_id: this.config.clientId,
    };

    const tokenRequest = new TokenRequest(tokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(tokenRequestor);
    return tokenHandler.performTokenRequest(this._configuration, tokenRequest);
  }

  private async makeRevokeTokenRequest(): Promise<void> {
    if (!this._tokenResponse)
      throw new BentleyError(AuthStatus.Error, "Missing refresh token. First call signIn() and ensure it's successful");
    assert(this.config !== undefined);

    const refreshToken = this._tokenResponse.refreshToken!;

    const revokeTokenRequestJson: RevokeTokenRequestJson = {
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: this.config.clientId,
    };

    const revokeTokenRequest = new RevokeTokenRequest(revokeTokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(tokenRequestor);
    await tokenHandler.performRevokeTokenRequest(this._configuration!, revokeTokenRequest);

    Logger.logTrace(loggerCategory, "Authorization revoked, and removed access token");
    await this.clearTokenResponse();
  }
}
