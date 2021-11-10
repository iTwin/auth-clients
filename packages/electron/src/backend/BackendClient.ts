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

import { AccessToken, assert, AuthStatus, BeEvent, BentleyError, Logger } from "@itwin/core-bentley";
import { AuthorizationClient, IModelError } from "@itwin/core-common";
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
import { DefaultRequestOptionsProvider, RequestOptions } from "@bentley/itwin-client";
import { BrowserWindow, ipcMain } from "electron";
import { ElectronAuthIPCChannelNames } from "../frontend/FrontendClient";
const loggerCategory = "electron-auth";

/**
 * Client configuration to generate OIDC/OAuth tokens for native applications
 * @beta
 */
export interface ElectronAuthorizationBackendConfiguration {
  /**
   * The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined.
   */
  issuerUrl?: string;

  /**
   * Upon signing in, the client application receives a response from the Bentley IMS OIDC/OAuth2 provider at this URI
   * For mobile/desktop applications, must start with `http://localhost:${redirectPort}` or `https://localhost:${redirectPort}`
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
 * Utility to generate OIDC/OAuth tokens for Desktop Applications
 * @beta
 */
export class ElectronAuthorizationBackend implements AuthorizationClient {
  protected _accessToken: AccessToken = "";
  public config: ElectronAuthorizationBackendConfiguration;
  public expireSafety = 60 * 10; // refresh token 10 minutes before real expiration time
  public url = "https://ims.bentley.com";
  public static defaultRedirectUri = "http://localhost:3000/signin-callback";
  private _configuration: AuthorizationServiceConfiguration | undefined;
  private _tokenResponse: TokenResponse | undefined;
  private _tokenStore?: ElectronTokenStore;
  private _expiresAt?: Date;
  public get tokenStore() { return this._tokenStore; }
  private static _defaultRequestOptionsProvider: DefaultRequestOptionsProvider;

  private constructor(config: ElectronAuthorizationBackendConfiguration) {
    this.config = config;
    this.setupIPCHandlers();

    if (!this.config)
      throw new IModelError(AuthStatus.Error, "Must specify a valid configuration when initializing ElectronAuthorizationBackend");

    let prefix = process.env.IMJS_URL_PREFIX;
    const authority = new URL(this.config.issuerUrl ?? this.url);
    if (prefix && !this.config.issuerUrl) {
      prefix = prefix === "dev-" ? "qa-" : prefix;
      authority.hostname = prefix + authority.hostname;
    }
    this.url = authority.href.replace(/\/$/, "");

    if (this.config.expiryBuffer)
      this.expireSafety = this.config.expiryBuffer;

  }

  public static async create(config: ElectronAuthorizationBackendConfiguration): Promise<ElectronAuthorizationBackend> {
    const authClient = new ElectronAuthorizationBackend(config);
    await authClient.initialize();
    return authClient;
  }

  private setupIPCHandlers(): void {
    // SignIn
    ipcMain.handle(ElectronAuthIPCChannelNames.signIn, async () => {
      await this.signIn();
    });

    // SignOut
    ipcMain.handle(ElectronAuthIPCChannelNames.signOut, async () => {
      await this.signOut();
    });

    // GetAccessToken
    ipcMain.handle(ElectronAuthIPCChannelNames.getAccessToken, async () => {
      const accessToken = await this.getAccessToken();
      return accessToken;
    });
  }

  /**
   * Notifies ElectronAppAuthorization that the access token has changed so it can raise
   * an event for anything subscribed to its listener
   */
  private notifyFrontendAccessTokenChange(token: AccessToken): void {
    const window = BrowserWindow.getAllWindows()[0];
    window?.webContents.send(ElectronAuthIPCChannelNames.onAccessTokenChanged, token);
  }

  private notifyFrontendAccessTokenExpirationChange(expiresAt: Date): void {
    const window = BrowserWindow.getAllWindows()[0];
    window?.webContents.send(ElectronAuthIPCChannelNames.onAccessTokenExpirationChanged, expiresAt);
  }

  /**
   * Augments request options with defaults returned by the DefaultRequestOptionsProvider.
   * @note The options passed in by clients override any defaults where necessary.
   * @param options Options the caller wants to augment with the defaults.
   * @returns Promise resolves after the defaults are setup.
   */
  protected async setupOptionDefaults(options: RequestOptions): Promise<void> {
    if (!ElectronAuthorizationBackend._defaultRequestOptionsProvider)
      ElectronAuthorizationBackend._defaultRequestOptionsProvider = new DefaultRequestOptionsProvider();
    return ElectronAuthorizationBackend._defaultRequestOptionsProvider.assignOptions(options);
  }

  public static readonly onUserStateChanged = new BeEvent<(token: AccessToken) => void>();

  public get redirectUri() { return this.config.redirectUri ?? ElectronAuthorizationBackend.defaultRedirectUri; }

  public setAccessToken(token: AccessToken) {
    if (token === this._accessToken)
      return;
    this._accessToken = token;
    this.notifyFrontendAccessTokenChange(this._accessToken);
    ElectronAuthorizationBackend.onUserStateChanged.raiseEvent(this._accessToken);
  }

  /**
   * Used to initialize the client - must be awaited before any other methods are called.
   * The call attempts a silent sign-if possible.
   */
  private async initialize(): Promise<void> {
    this._tokenStore = new ElectronTokenStore(this.config.clientId);

    try {
      const tokenRequestor = new NodeRequestor(); // the Node.js based HTTP client
      this._configuration = await AuthorizationServiceConfiguration.fetchFromIssuer(this.url, tokenRequestor);
      Logger.logTrace(loggerCategory, "Initialized service configuration", () => ({ configuration: this._configuration }));

      // Attempt to load the access token from store
      await this.loadAccessToken();
    } catch (error: any) {
      Logger.logError(loggerCategory, error.message);
    }
  }

  /** Forces a refresh of the user's access token regardless if the current token has expired. */
  public async refreshToken(): Promise<AccessToken> {
    if (this._tokenResponse === undefined || this._tokenResponse.refreshToken === undefined)
      throw new BentleyError(AuthStatus.Error, "Not signed In. First call signIn()");

    return this.refreshAccessToken(this._tokenResponse.refreshToken);
  }

  /** Loads the access token from the store, and refreshes it if necessary and possible
   * @return AccessToken if it's possible to get a valid access token, and undefined otherwise.
   */
  private async loadAccessToken(): Promise<AccessToken> {
    const tokenResponse = await this.tokenStore?.load();
    if (tokenResponse === undefined || tokenResponse.refreshToken === undefined)
      return "";
    try {
      return await this.refreshAccessToken(tokenResponse.refreshToken);
    } catch (err) {
      Logger.logError(loggerCategory, `Error refreshing access token`, () => BentleyError.getErrorProps(err));
      return "";
    }
  }

  /** Initializes and completes the sign-in process for the user.
   *
   * Once the promise is returned, use [[ElectronAuthorizationBackend.getAccessToken]] to retrieve the token.
   *
   * The following actions happen upon completion of the promise:
   * - calls the onUserStateChanged() call back after the authorization completes
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

  /** Signs out the current user.
   *
   * The following actions happen upon completion:
   *
   * - calls the onUserStateChanged() call back after the authorization completes
   *   or if there is an error.
   * - redirects application to the postSignoutRedirectUri specified in the configuration when the sign out is
   *   complete
   */
  public async signOut(): Promise<void> {
    await this.makeRevokeTokenRequest();
  }

  private async clearTokenResponse() {
    this._tokenResponse = undefined;
    await this.tokenStore?.delete();
    this.setAccessToken("");
  }

  private async setTokenResponse(tokenResponse: TokenResponse): Promise<AccessToken> {
    const accessToken = tokenResponse.accessToken;
    this._tokenResponse = tokenResponse;
    const expiresAtMilliseconds = (tokenResponse.issuedAt + (tokenResponse.expiresIn ?? 0)) * 1000;
    this._expiresAt = new Date(expiresAtMilliseconds);
    this.notifyFrontendAccessTokenExpirationChange(this._expiresAt);

    await this.tokenStore?.save(this._tokenResponse);
    const bearerToken = `${tokenResponse.tokenType} ${accessToken}`;
    this.setAccessToken(bearerToken);
    return bearerToken;
  }

  private get _hasExpired(): boolean {
    if (!this._expiresAt)
      return false;

    return this._expiresAt.getTime() - Date.now() <= this.expireSafety * 1000; // Consider this.expireSafety's amount of time early as expired
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
    try {
      // eslint-disable-next-line @typescript-eslint/return-await
      return tokenHandler.performTokenRequest(this._configuration, tokenRequest);
    } catch (err) {
      Logger.logError(loggerCategory, `Error performing token request from token handler`, () => BentleyError.getErrorProps(err));
      throw err;
    }
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
