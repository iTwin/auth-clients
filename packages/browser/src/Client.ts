/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Authorization
 */

import type { AccessToken} from "@itwin/core-bentley";
import { BeEvent } from "@itwin/core-bentley";
import type { AuthorizationClient } from "@itwin/core-common";
import type { User, UserManagerSettings} from "oidc-client";
import { UserManager, WebStorageStateStore } from "oidc-client";
import { BrowserAuthorizationLogger } from "./Logger";
import type { BrowserAuthorizationClientRedirectState } from "./ClientRedirectState";

/**
 * @beta
 */
export interface BrowserAuthorizationClientConfiguration extends BrowserAuthorizationClientRequestOptions {
  /** The URL of the OIDC/OAuth2 provider. If left undefined, the Bentley auth authority will be used by default. */
  readonly authority?: string;
  /** The unique client id registered through the issuing authority. Required to obtain authorization from the user. */
  readonly clientId: string;
  /**
   * The URL passed in the authorization request, to which the authority will redirect the browser after the user grants/denies access
   * The redirect URL must be registered against the clientId through the issuing authority to be considered valid.
   */
  readonly redirectUri: string;
  /**
   * The URL passed in the signout request, to which the authority will redirect the browser after the user has been signed out.
   * The signout URL must be registered against the clientId through the issuing authority to be considered valid.
   */
  readonly postSignoutRedirectUri?: string;
  /** A space-delimited collection of individual access claims specified by the authority. The user must consent to all specified scopes in order to grant authorization */
  readonly scope: string;
  /** The mechanism (or authentication flow) used to acquire auth information from the user through the authority */
  readonly responseType?: "code" | "id_token" | "id_token token" | "code id_token" | "code token" | "code id_token token" | string;
  /** if true, do NOT attempt a silent signIn on startup of the application */
  readonly noSilentSignInOnAppStartup?: boolean;
  /** The redirect URL used for silent sign in and renew. If not provided, will default to redirectUri. */
  readonly silentRedirectUri?: string;
}

/**
 * Interface describing per-request configuration options for authorization requests
 * see: https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest
 * @public
 */
export interface BrowserAuthorizationClientRequestOptions {
  /** The required action demanded of the user before the authentication request can succeed */
  prompt?: "none" | "login" | "consent" | "select_account" | string;
}

/** BrowserAuthorization type guard.
 * @beta
 */
export const isBrowserAuthorizationClient = (client: AuthorizationClient | undefined): client is BrowserAuthorizationClient => {
  return client !== undefined && (client as BrowserAuthorizationClient).signIn !== undefined && (client as BrowserAuthorizationClient).signOut !== undefined;
};

/**
 * @beta
 */
export class BrowserAuthorizationClient implements AuthorizationClient {
  public readonly onAccessTokenChanged = new BeEvent<(token: AccessToken) => void>();
  public url = "https://ims.bentley.com";
  protected _userManager?: UserManager;

  protected _basicSettings: BrowserAuthorizationClientConfiguration;
  protected _advancedSettings?: UserManagerSettings;

  protected _accessToken: AccessToken = "";
  protected _expiresAt?: Date;

  public constructor(configuration: BrowserAuthorizationClientConfiguration) {
    BrowserAuthorizationLogger.initializeLogger();
    this._basicSettings = configuration;

    let prefix = process.env.IMJS_URL_PREFIX;
    const authority = new URL(this._basicSettings.authority ?? this.url);
    if (prefix && !this._basicSettings.authority) {
      prefix = prefix === "dev-" ? "qa-" : prefix;
      authority.hostname = prefix + authority.hostname;
    }
    this.url = authority.href.replace(/\/$/, "");
  }

  public get isAuthorized(): boolean {
    return this.hasSignedIn;
  }

  public get hasExpired(): boolean {
    if (this._expiresAt)
      return this._expiresAt.getTime() - Date.now() <= 1 * 60 * 1000; // Consider 1 minute before expiry as expired;
    return !this._accessToken;
  }

  public get hasSignedIn(): boolean {
    return !!this._accessToken;
  }

  protected async getUserManager(): Promise<UserManager> {
    if (this._userManager) {
      return this._userManager;
    }

    const settings = await this.getUserManagerSettings(this._basicSettings, this._advancedSettings);
    this._userManager = this.createUserManager(settings);
    return this._userManager;
  }

  /**
   * Merges the basic and advanced settings into a single configuration object consumable by the internal userManager.
   * @param requestContext
   * @param basicSettings
   * @param advancedSettings
   */
  protected async getUserManagerSettings(basicSettings: BrowserAuthorizationClientConfiguration, advancedSettings?: UserManagerSettings): Promise<UserManagerSettings> {
    let userManagerSettings: UserManagerSettings = {
      authority: basicSettings.authority,
      redirect_uri: basicSettings.redirectUri, // eslint-disable-line @typescript-eslint/naming-convention
      client_id: basicSettings.clientId, // eslint-disable-line @typescript-eslint/naming-convention
      scope: basicSettings.scope,
      post_logout_redirect_uri: basicSettings.postSignoutRedirectUri, // eslint-disable-line @typescript-eslint/naming-convention
      response_type: basicSettings.responseType, // eslint-disable-line @typescript-eslint/naming-convention
      automaticSilentRenew: true,
      silent_redirect_uri: basicSettings.silentRedirectUri, // eslint-disable-line @typescript-eslint/naming-convention
      userStore: new WebStorageStateStore({ store: window.localStorage }),
      prompt: basicSettings.prompt,
    };

    if (advancedSettings) {
      userManagerSettings = Object.assign(userManagerSettings, advancedSettings);
    }

    if (!userManagerSettings.authority) {
      userManagerSettings.authority = this.url;
    }

    return userManagerSettings;
  }

  /**
   * Creates the internal user manager and binds all relevant events to their respective callback function.
   * @param settings
   */
  protected createUserManager(settings: UserManagerSettings): UserManager {
    const userManager = new UserManager(settings);

    userManager.events.addUserLoaded(this._onUserLoaded);
    userManager.events.addUserUnloaded(this._onUserUnloaded);
    userManager.events.addAccessTokenExpiring(this._onAccessTokenExpiring);
    userManager.events.addAccessTokenExpired(this._onAccessTokenExpired);
    userManager.events.addSilentRenewError(this._onSilentRenewError);
    userManager.events.addUserSignedOut(this._onUserSignedOut);

    return userManager;
  }

  /**
   * Alias for signInRedirect needed to satisfy [[FrontendAuthorizationClient]]
   * @param requestContext
   */
  public async signIn(): Promise<void> {
    return this.signInRedirect();
  }

  /**
   * Attempts a sign-in via redirection with the authorization provider.
   * If possible, a non-interactive signin will be attempted first.
   * If successful, the returned promise will be resolved.
   * Otherwise, an attempt to redirect the browser will proceed.
   * If an error prevents the redirection from occurring, the returned promise will be rejected with the responsible error.
   * Otherwise, the browser's window will be redirected away from the current page, effectively ending execution here.
   */
  public async signInRedirect(successRedirectUrl?: string, args?: BrowserAuthorizationClientRequestOptions): Promise<void> {
    const user = await this.nonInteractiveSignIn(args);
    if (user) {
      return;
    }

    const userManager = await this.getUserManager();
    const state: BrowserAuthorizationClientRedirectState = {
      successRedirectUrl: successRedirectUrl || window.location.href,
    };

    const redirectArgs = Object.assign({ state }, args);
    await userManager.signinRedirect(redirectArgs); // This call changes the window's URL, which effectively ends execution here unless an exception is thrown.
  }

  /**
   * Attempts a sign-in via popup with the authorization provider
   * @param requestContext
   */
  public async signInPopup(args?: BrowserAuthorizationClientRequestOptions): Promise<void> {
    let user = await this.nonInteractiveSignIn(args);
    if (user) {
      return;
    }

    const userManager = await this.getUserManager();
    user = await userManager.signinPopup(args);
    if (!user || user.expired)
      throw new Error("Expected userManager.signinPopup to always resolve to an authorized user");
    return;
  }

  /**
   * Attempts a silent sign in with the authorization provider
   * @throws [Error] If the silent sign in fails
   */
  public async signInSilent(): Promise<void> {
    const user = await this.nonInteractiveSignIn();
    if (user === undefined || user.expired)
      throw new Error("Authorization error: Silent sign-in failed");
  }

  /**
   * Attempts a non-interactive signIn
   * - tries to load the user from storage
   * - tries to silently sign-in the user
   */
  protected async nonInteractiveSignIn(args?: BrowserAuthorizationClientRequestOptions): Promise<User | undefined> {
    const userManager = await this.getUserManager();
    const settingsPromptRequired = userManager.settings.prompt !== undefined && userManager.settings.prompt !== "none";
    const argsPromptRequired = args?.prompt !== undefined && args.prompt !== "none";
    if (settingsPromptRequired || argsPromptRequired) { // No need to even try a silent sign in if we know the prompt will force its failure.
      return undefined;
    }

    let user = await this.loadUser();
    if (user) {
      return user;
    }

    // Attempt a silent sign-in
    try {
      user = await userManager.signinSilent(); // calls events
      return user;
    } catch (err) {
      return undefined;
    }
  }

  /**
   * Gets the user from storage
   * @return User found in storage.
   * - Resolves to undefined if no user was found.
   * - Returned user may have expired - so it's up to the caller to check the expired state
   */
  protected async loadUser(): Promise<User | undefined> {
    const userManager = await this.getUserManager();
    const user = await userManager.getUser();

    if (user && !user.expired) {
      this._onUserLoaded(user); // Call only because getUser() doesn't call any events
      return user;
    }

    return undefined;
  }

  protected initAccessToken(user: User | undefined) {
    if (!user) {
      this._accessToken = "";
      return;
    }
    this._accessToken = `Bearer ${user.access_token}`;
    this._expiresAt = new Date(user.expires_at * 1000);
  }

  /**
   * Alias for signOutRedirect
   * @param requestContext
   */
  public async signOut(): Promise<void> {
    await this.signOutRedirect();
  }

  public async signOutRedirect(): Promise<void> {
    const userManager = await this.getUserManager();

    await userManager.signoutRedirect();
  }

  public async signOutPopup(): Promise<void> {
    const userManager = await this.getUserManager();

    await userManager.signoutPopup();
  }

  /**
   * Returns a promise that resolves to the AccessToken of the currently authorized user.
   * The token is refreshed as necessary.
   * @throws [Error] If signIn() was not called, or there was an authorization error.
   */
  public async getAccessToken(): Promise<AccessToken> {
    if (this._accessToken)
      return this._accessToken;
    throw new Error("Authorization error: Not signed in.");
  }

  /**
   * Checks the current local user session against that of the identity provider.
   * If the session is no longer valid, the local user is removed from storage.
   * @returns true if the local session is still active with the provider, false otherwise.
   * @param requestContext
   * @param ignoreCheckInterval Bypass the default behavior to wait until a certain time has passed since the last check was performed
   */
  public async checkSessionStatus(): Promise<boolean> {
    const userManager = await this.getUserManager();
    try {
      await userManager.querySessionStatus();
    } catch (err) { // Access token is no longer valid in this session
      await userManager.removeUser();
      return false;
    }

    return true;
  }

  protected _onUserStateChanged = (user: User | undefined) => {
    this.initAccessToken(user);
    try {
      this.onAccessTokenChanged.raiseEvent(this._accessToken);
    } catch (err) {
      return; // TODO: Replace
      // Logger.logError(FrontendAuthorizationClientLoggerCategory.Authorization, "Error thrown when handing OidcBrowserClient.onUserStateChanged event", () => ({ message: err.message }));
    }
  };

  /**
   * Raised when a user session has been established (or re-established).
   * This can happen on startup, after token refresh or token callback.
   */
  protected _onUserLoaded = (user: User) => {
    this._onUserStateChanged(user);
  };

  /**
   * Raised when a user session has been terminated.
   */
  protected _onUserUnloaded = () => {
    this._onUserStateChanged(undefined);
  };

  /**
   * Raised prior to the access token expiring
   */
  protected _onAccessTokenExpiring = async () => {
  };

  /**
   * Raised after the access token has expired.
   */
  protected _onAccessTokenExpired = () => {
    this._onUserStateChanged(undefined);
  };

  /**
   * Raised when the automatic silent renew has failed.
   */
  protected _onSilentRenewError = () => {
  };

  /**
   * Raised when the user's sign-in status at the OP has changed.
   */
  protected _onUserSignedOut = () => {
    this._onUserStateChanged(undefined);
  };

  /** Disposes the resources held by this client */
  public dispose(): void {
    if (this._userManager) {
      this._userManager.events.removeUserLoaded(this._onUserLoaded);
      this._userManager.events.removeAccessTokenExpiring(this._onAccessTokenExpiring);
      this._userManager.events.removeAccessTokenExpired(this._onAccessTokenExpired);
      this._userManager.events.removeUserUnloaded(this._onUserUnloaded);
      this._userManager.events.removeSilentRenewError(this._onSilentRenewError);
      this._userManager.events.removeUserSignedOut(this._onUserSignedOut);
    }
  }

  /**
   * @internal
   * Allows for advanced options to be supplied to the underlying UserManager.
   * This function should be called directly after object construction.
   * Any settings supplied via this method will override the corresponding settings supplied via the constructor.
   * @throws if called after the internal UserManager has already been created.
   */
  public setAdvancedSettings(settings: UserManagerSettings): void {
    if (this._userManager) {
      throw new Error("Cannot supply advanced settings to BrowserAuthorizationClient after the underlying UserManager has already been created.");
    }

    this._advancedSettings = settings;
  }
}
