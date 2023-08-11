/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

/** @packageDocumentation
 * @module Main
 */

// cSpell:ignore openid appauth signin Pkce Signout
/* eslint-disable @typescript-eslint/naming-convention */

import type { AccessToken } from "@itwin/core-bentley";
import { assert, BeEvent, BentleyError, Logger } from "@itwin/core-bentley";
import type { AuthorizationClient, IpcSocketBackend } from "@itwin/core-common";
import type {
  AuthorizationError,
  AuthorizationRequestJson,
  AuthorizationResponse,
  RevokeTokenRequestJson,
  StringMap,
  TokenRequestHandler,
  TokenRequestJson,
  TokenResponse,
} from "@openid/appauth";
import {
  AuthorizationNotifier,
  AuthorizationRequest,
  AuthorizationServiceConfiguration,
  BaseTokenRequestHandler,
  GRANT_TYPE_AUTHORIZATION_CODE,
  GRANT_TYPE_REFRESH_TOKEN,
  RevokeTokenRequest,
  TokenRequest,
} from "@openid/appauth";
import { NodeCrypto, NodeRequestor } from "@openid/appauth/built/node_support";
import { ElectronAuthorizationEvents } from "./Events";
import { ElectronMainAuthorizationRequestHandler } from "./ElectronMainAuthorizationRequestHandler";
import { RefreshTokenStore } from "./TokenStore";
import { LoopbackWebServer } from "./LoopbackWebServer";
import * as electron from "electron";
import type { IpcChannelNames } from "../common/IpcChannelNames";
import { getIpcChannelNames } from "../common/IpcChannelNames";
const loggerCategory = "electron-auth";

/**
 * - "none" - The Authorization Server MUST NOT display any authentication or consent user interface pages.
 * - "login" - The Authorization Server SHOULD prompt the End-User for re-authentication.
 * - "consent" - The Authorization Server SHOULD prompt the End-User for consent before returning information to the Client.
 * - "select_account" - The Authorization Server SHOULD prompt the End-User to select a user account.
 */
export type PromptOptions = "none" | "login" | "consent" | "select_account";

/**
 * Additional options that will be used to make an OIDC authentication request.
 */
export interface AuthenticationOptions {
  /**
   * Specifies whether the Authorization Server prompts the End-User for re-authentication and consent.
   */
  prompt?: PromptOptions;

  /**
   * Other options to be included in OIDC authentication request.
   */
  [key: string]: string | undefined;
}

/**
 * Client configuration to generate OIDC/OAuth tokens for native applications
 * @beta
 */
export interface ElectronMainAuthorizationConfiguration {
  /**
   * The OAuth token issuer URL. Defaults to Bentley's auth production URL if undefined.
   */
  readonly issuerUrl?: string;

  /**
   * List of redirect URIs available for use in the OAuth authorization flow.
   *
   * @note Upon signing in, the client application receives a response from the Bentley IMS OIDC/OAuth2 provider at given URI.
   * For mobile/desktop applications, given redirect URIs must start with `http://localhost:${redirectPort}` or `https://localhost:${redirectPort}`.
   * In the unlikely, but possible case of a port collision, it is recommended to use multiple (e.g. three) redirect URIs with different ports.
   * A decent strategy for choosing ports for your application is: `3|4|5{GPR_ID}`. For example (GPR_ID used here is 1234):
   * - `http://localhost:31234/signin-callback`
   * - `http://localhost:41234/signin-callback`
   * - `http://localhost:51234/signin-callback`
   */
  readonly redirectUris: string[];

  /** Client application's identifier as registered with the OIDC/OAuth2 provider. */
  readonly clientId: string;

  /**
   * List of space separated scopes to request access to various resources.
   *
   * @note 'offline_access' scope is always included by {@link ElectronMainAuthorization} when performing
   * {@link ElectronMainAuthorization.signIn}, i.e. this library assumes that refresh tokens are always used and retrieved
   * from the Authorization Server. Note that OIDC Clients need to have refresh tokens enabled in the server side
   * configuration (for IMS, see https://imsoidcui.bentley.com/clients).
   */
  readonly scopes: string;

  /**
   * Time in seconds that's used as a buffer to check the token for validity/expiry.
   * The checks for authorization, and refreshing access tokens all use this buffer - i.e., the token is considered expired if the current time is within the specified
   * time of the actual expiry.
   * @note If unspecified this defaults to 10 minutes.
   */
  readonly expiryBuffer?: number;

  /**
   * Optional custom implementation of {@link IpcSocketBackend} to use for IPC communication with the Frontend counterpart of
   * authorization client, see {@link ElectronRendererAuthorization}. If not provided, default IPC implementation is used.
   */
  readonly ipcSocket?: IpcSocketBackend;

  /**
   * Additional options to use for every OIDC authentication request made by {@link ElectronMainAuthorization}.
   */
  readonly authenticationOptions?: AuthenticationOptions;
}

/**
 * Utility to generate OIDC/OAuth tokens for Desktop Applications
 * @beta
 */
export class ElectronMainAuthorization implements AuthorizationClient {
  protected _accessToken: AccessToken = "";

  private _issuerUrl = "https://ims.bentley.com";
  private _redirectUris: string[];
  private _clientId: string;
  private _scopes: string;
  private _expiryBuffer = 60 * 10; // refresh token 10 minutes before real expiration time
  private _ipcChannelNames: IpcChannelNames;
  private _ipcSocket?: IpcSocketBackend;
  private _configuration: AuthorizationServiceConfiguration | undefined;
  private _refreshToken: string | undefined;
  private _refreshTokenStore: RefreshTokenStore;
  private _expiresAt?: Date;
  private _extras?: AuthenticationOptions;

  public static readonly onUserStateChanged = new BeEvent<
  (token: AccessToken) => void
  >();

  public constructor(config: ElectronMainAuthorizationConfiguration) {
    if (!config.clientId || !config.scopes || config.redirectUris.length === 0)
      throw new Error(
        "Must specify a valid configuration with a clientId, scopes and redirect URIs when initializing ElectronMainAuthorization"
      );

    // This library assumes that refresh tokens will be used by the Client. 'offline_access' is a special OAuth
    // defined scope that is required to get a refresh token after successful Authorization.
    if (!config.scopes.includes("offline_access")) {
      this._scopes = `${config.scopes} offline_access`;
    } else {
      this._scopes = config.scopes;
    }

    this._clientId = config.clientId;
    this._redirectUris = config.redirectUris;
    this._ipcChannelNames = getIpcChannelNames(this._clientId);
    this._ipcSocket = config.ipcSocket;
    this._extras = config.authenticationOptions;

    this.setupIPCHandlers();

    let prefix = process.env.IMJS_URL_PREFIX;
    const authority = new URL(config.issuerUrl ?? this._issuerUrl);
    if (prefix && !config.issuerUrl) {
      prefix = prefix === "dev-" ? "qa-" : prefix;
      authority.hostname = prefix + authority.hostname;
    }
    this._issuerUrl = authority.href.replace(/\/$/, "");

    if (config.expiryBuffer)
      this._expiryBuffer = config.expiryBuffer;

    const configFileName =  `iTwinJs_${this._clientId}`;
    const appStorageKey = `${configFileName}:${this._issuerUrl}`;
    this._refreshTokenStore = new RefreshTokenStore(configFileName, appStorageKey);
  }

  /**
   * Register a persistent handler function that will process incoming Frontend IPC messages from given channel.
   * It is expected that messages received by specified channels originate from an instance of
   * {@link ElectronRendererAuthorization} that matches this Backend auth client instance.
   * @param channel Name of the channel to handle messages from.
   * @param handler Function that will be executed to process incoming messages.
   */
  private handleIpcMessage(
    channel: string,
    handler: (...args: any[]) => Promise<any>
  ) {
    if (this._ipcSocket) {
      this._ipcSocket.handle(channel, handler);
    } else {
      electron.ipcMain.handle(channel, handler);
    }
  }

  /**
   * Send an IPC message to the Frontend via given channel. Sent message is expected to be received and handled
   * by an instance of {@link ElectronRendererAuthorization} that matches this Backend auth client instance.
   * @param channel Name of the to which given message should be sent.
   * @param data Array of objects/values to send over the IPC channel in a single message.
   */
  private sendIpcMessage(channel: string, ...data: any[]) {
    if (this._ipcSocket) {
      this._ipcSocket.send(channel, ...data);
    } else {
      const window = electron.BrowserWindow.getAllWindows()[0];
      window?.webContents.send(channel, ...data);
    }
  }

  private setupIPCHandlers(): void {
    this.handleIpcMessage(this._ipcChannelNames.signIn, async () => {
      await this.signIn();
    });

    this.handleIpcMessage(this._ipcChannelNames.signOut, async () => {
      await this.signOut();
    });

    this.handleIpcMessage(this._ipcChannelNames.getAccessToken, async () => {
      const accessToken = await this.getAccessToken();
      return accessToken;
    });

    this.handleIpcMessage(this._ipcChannelNames.signInSilent, async () => {
      await this.signInSilent();
    });
  }

  /**
   * Notifies ElectronRendererAuthorization that the access token has changed so it can raise
   * an event for anything subscribed to its listener
   */
  private notifyFrontendAccessTokenChange(token: AccessToken): void {
    this.sendIpcMessage(this._ipcChannelNames.onAccessTokenChanged, token);
  }

  private notifyFrontendAccessTokenExpirationChange(expiresAt: Date): void {
    this.sendIpcMessage(
      this._ipcChannelNames.onAccessTokenExpirationChanged,
      expiresAt
    );
  }

  public get scopes() {
    return this._scopes;
  }

  public get issuerUrl() {
    return this._issuerUrl;
  }

  public get redirectUris() {
    return this._redirectUris;
  }

  public async getAccessToken(): Promise<AccessToken> {
    if (this._hasExpired || !this._accessToken) {
      const accessToken = await this.refreshToken();
      this.setAccessToken(accessToken);

      return accessToken;
    }

    return this._accessToken;
  }

  private setAccessToken(token: AccessToken) {
    if (token === this._accessToken)
      return;

    this._accessToken = token;
    this.notifyFrontendAccessTokenChange(this._accessToken);
    ElectronMainAuthorization.onUserStateChanged.raiseEvent(this._accessToken);
  }

  /** Forces a refresh of the user's access token regardless if the current token has expired. */
  public async refreshToken(): Promise<AccessToken> {
    if (this._refreshToken === undefined)
      throw new Error("Not signed In. First call signIn()");

    return this.refreshAccessToken(this._refreshToken);
  }

  /** Loads the access token from the store, and refreshes it if necessary and possible
   * @return AccessToken if it's possible to get a valid access token, and undefined otherwise.
   */
  private async loadAccessToken(): Promise<AccessToken> {
    const refreshToken = await this._refreshTokenStore.load();
    if (!refreshToken)
      return "";

    try {
      return await this.refreshAccessToken(refreshToken);
    } catch (err) {
      Logger.logError(loggerCategory, `Error refreshing access token`, () =>
        BentleyError.getErrorProps(err)
      );
      return "";
    }
  }

  /** Initializes and completes the sign-in process for the user.
   *
   * Once the promise is returned, use [[ElectronMainAuthorization.getAccessToken]] to retrieve the token.
   *
   * The following actions happen upon completion of the promise:
   * - calls the onUserStateChanged() call back after the authorization completes
   * or if there is an error.
   * - will attempt in order:
   *   (i) load any existing authorized user from storage,
   *   (ii) an interactive signin that requires user input.
   */
  public async signIn(): Promise<void> {
    if (!this._configuration) {
      const tokenRequestor = new NodeRequestor(); // the Node.js based HTTP client
      this._configuration =
        await AuthorizationServiceConfiguration.fetchFromIssuer(
          this._issuerUrl,
          tokenRequestor
        );
      Logger.logTrace(
        loggerCategory,
        "Initialized service configuration",
        () => ({ configuration: this._configuration })
      );
    }

    // Attempt to load the access token from store
    const token = await this.loadAccessToken();
    if (token)
      return this.setAccessToken(token);

    // Start an HTTP server to listen for browser requests. Due to possible port collisions, iterate over given
    // redirectUris until we successfully bind the HTTP listener to a port.
    let redirectUri = "";
    for (const tryRedirectUri of this._redirectUris) {
      try {
        await LoopbackWebServer.start(tryRedirectUri);
        redirectUri = tryRedirectUri;
        break;
      } catch (e: unknown) {
        // Most common error is EADDRINUSE (port already in use) - just continue with the next port
        continue;
      }
    }

    if (redirectUri === "") {
      throw new Error(
        `Failed to start an HTTP server with given redirect URIs, [${this._redirectUris.toString()}]`
      );
    }

    // Create the authorization request
    const authReqJson: AuthorizationRequestJson = {
      client_id: this._clientId,
      redirect_uri: redirectUri,
      scope: this._scopes,
      response_type: AuthorizationRequest.RESPONSE_TYPE_CODE,
      extras: this._extras as StringMap,
    };
    const usePkce = true;
    const authorizationRequest = new AuthorizationRequest(
      authReqJson,
      new NodeCrypto(),
      usePkce
    );
    await authorizationRequest.setupCodeVerifier();

    // Create events for this signin attempt
    const authorizationEvents = new ElectronAuthorizationEvents();

    // Ensure that completion callbacks are correlated to the correct authorization request
    LoopbackWebServer.addCorrelationState(
      authorizationRequest.state,
      authorizationEvents
    );

    const authorizationHandler = new ElectronMainAuthorizationRequestHandler(
      authorizationEvents
    );

    // Setup a notifier to obtain the result of authorization
    const notifier = new AuthorizationNotifier();
    authorizationHandler.setAuthorizationNotifier(notifier);
    notifier.setAuthorizationListener(
      async (
        authRequest: AuthorizationRequest,
        authResponse: AuthorizationResponse | null,
        authError: AuthorizationError | null
      ) => {
        Logger.logTrace(
          loggerCategory,
          "Authorization listener invoked",
          () => ({ authRequest, authResponse, authError })
        );

        const tokenResponse = await this._onAuthorizationResponse(
          authRequest,
          authResponse,
          authError
        );
        authorizationEvents.onAuthorizationResponseCompleted.raiseEvent(
          authError ? authError : undefined
        );

        if (tokenResponse)
          // await this.saveRefreshToken(tokenResponse);
          await this.processTokenResponse(tokenResponse);
        else
          await this.clearTokenCache();
      }
    );

    // Start the signin
    await authorizationHandler.performAuthorizationRequest(
      this._configuration,
      authorizationRequest
    );
  }

  /**
   * Attempts a silent sign in with the authorization provider
   */
  public async signInSilent(): Promise<void> {
    if (!this._configuration) {
      const tokenRequestor = new NodeRequestor(); // the Node.js based HTTP client
      this._configuration =
        await AuthorizationServiceConfiguration.fetchFromIssuer(
          this._issuerUrl,
          tokenRequestor
        );
      Logger.logTrace(
        loggerCategory,
        "Initialized service configuration",
        () => ({ configuration: this._configuration })
      );
    }
    try {
      // Attempt to load the access token from store
      await this.loadAccessToken();
    } catch (error: any) {
      Logger.logError(loggerCategory, error.message);
    }
  }

  private async _onAuthorizationResponse(
    authRequest: AuthorizationRequest,
    authResponse: AuthorizationResponse | null,
    authError: AuthorizationError | null
  ): Promise<TokenResponse | undefined> {
    // Phase 1 of login has completed to fetch the authorization code - check for errors
    if (authError) {
      Logger.logError(
        loggerCategory,
        "Authorization error. Unable to get authorization code.",
        () => authError
      );
      return undefined;
    }

    if (!authResponse || authResponse.state !== authRequest.state) {
      Logger.logError(
        loggerCategory,
        "Authorization error. Unable to get authorization code",
        () => ({
          error: "invalid_state",
          errorDescription:
            "The login response state did not match the login request state.",
        })
      );
      return undefined;
    }

    // Phase 2: Swap the authorization code for the access token
    const tokenResponse = await this.swapAuthorizationCodeForTokens(
      authResponse.code,
      authRequest.internal!.code_verifier,
      authRequest.redirectUri
    );
    Logger.logTrace(
      loggerCategory,
      "Authorization completed, and issued access token"
    );

    return tokenResponse;
  }

  /** Signs out the current user.
   *
   * The following actions happen upon completion:
   *
   * - calls the onUserStateChanged() call back after the signout completes without error.
   */
  public async signOut(): Promise<void> {
    await this.makeRevokeTokenRequest();
    if (this._configuration?.endSessionEndpoint)
      await electron.shell.openExternal(this._configuration.endSessionEndpoint);
  }

  private async processTokenResponse(
    tokenResponse: TokenResponse
  ): Promise<AccessToken> {
    this._refreshToken = tokenResponse.refreshToken;
    if (this._refreshToken)
      await this._refreshTokenStore.save(this._refreshToken);

    const expiresAtMilliseconds =
      (tokenResponse.issuedAt + (tokenResponse.expiresIn ?? 0)) * 1000;
    this._expiresAt = new Date(expiresAtMilliseconds);
    this.notifyFrontendAccessTokenExpirationChange(this._expiresAt);

    const bearerToken = `${tokenResponse.tokenType} ${tokenResponse.accessToken}`;
    this.setAccessToken(bearerToken);

    return bearerToken;
  }

  private async clearTokenCache() {
    this._refreshToken = undefined;
    this._expiresAt = undefined;

    await this._refreshTokenStore.delete();

    this.setAccessToken("");
  }

  private get _hasExpired(): boolean {
    if (!this._expiresAt)
      return false;

    return this._expiresAt.getTime() - Date.now() <= this._expiryBuffer * 1000; // Consider this.expireSafety's amount of time early as expired
  }

  private async refreshAccessToken(refreshToken: string): Promise<AccessToken> {
    const tokenResponse = await this.makeRefreshAccessTokenRequest(
      refreshToken
    );
    Logger.logTrace(
      loggerCategory,
      "Refresh token completed, and issued access token"
    );

    return this.processTokenResponse(tokenResponse);
  }

  /** Swap the authorization code for a refresh token and access token */
  private async swapAuthorizationCodeForTokens(
    authCode: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<TokenResponse> {
    if (!this._configuration)
      throw new Error("Not initialized. First call initialize()");
    assert(this._clientId !== "");

    const extras: StringMap = { code_verifier: codeVerifier };
    const tokenRequestJson: TokenRequestJson = {
      grant_type: GRANT_TYPE_AUTHORIZATION_CODE,
      code: authCode,
      redirect_uri: redirectUri,
      client_id: this._clientId,
      extras,
    };

    const tokenRequest = new TokenRequest(tokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(
      tokenRequestor
    );
    try {
      return await tokenHandler.performTokenRequest(
        this._configuration,
        tokenRequest
      );
    } catch (err) {
      Logger.logError(
        loggerCategory,
        `Error performing token request from token handler`,
        () => BentleyError.getErrorProps(err)
      );
      throw err;
    }
  }

  private async makeRefreshAccessTokenRequest(
    refreshToken: string
  ): Promise<TokenResponse> {
    if (!this._configuration)
      throw new Error("Not initialized. First call initialize()");
    assert(this._clientId !== "");

    // Redirect URI doesn't need to be specified when refreshing tokens (i.e. using 'grant_type=refresh_token').
    // Currently used oath TypeScript API is just lazy in its type definitions and doesn't differentiate between
    // 'authorization_code' and 'refresh_token' grant type token requests. See https://www.rfc-editor.org/rfc/rfc6749#section-6
    const redirect_uri = "";

    const tokenRequestJson: TokenRequestJson = {
      grant_type: GRANT_TYPE_REFRESH_TOKEN,
      refresh_token: refreshToken,
      client_id: this._clientId,
      redirect_uri,
    };

    const tokenRequest = new TokenRequest(tokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(
      tokenRequestor
    );

    return tokenHandler.performTokenRequest(this._configuration, tokenRequest);
  }

  private async makeRevokeTokenRequest(): Promise<void> {
    if (!this._refreshToken)
      throw new Error(
        "Missing refresh token. First call signIn() and ensure it's successful"
      );
    assert(this._clientId !== "");

    const revokeTokenRequestJson: RevokeTokenRequestJson = {
      token: this._refreshToken,
      token_type_hint: "refresh_token",
      client_id: this._clientId,
    };

    const revokeTokenRequest = new RevokeTokenRequest(revokeTokenRequestJson);
    const tokenRequestor = new NodeRequestor();
    const tokenHandler: TokenRequestHandler = new BaseTokenRequestHandler(
      tokenRequestor
    );
    await tokenHandler.performRevokeTokenRequest(
      this._configuration!,
      revokeTokenRequest
    );

    Logger.logTrace(
      loggerCategory,
      "Authorization revoked, and removed access token"
    );
    await this.clearTokenCache();
  }
}
