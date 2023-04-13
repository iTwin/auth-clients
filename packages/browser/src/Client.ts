/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Authorization
 */

import type { AccessToken } from "@itwin/core-bentley";
import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import { BeEvent, Logger, UnexpectedErrors } from "@itwin/core-bentley";
import { BrowserAuthorizationLogger } from "./Logger";
import { BrowserAuthorizationLoggerCategory } from "./LoggerCategory";
import { getImsAuthority } from "./utils";
import type { AuthorizationClient } from "@itwin/core-common";
import type { User, UserManagerSettings } from "oidc-client-ts";
import type { BrowserAuthorizationClientConfiguration, BrowserAuthorizationClientConfigurationOptions, BrowserAuthorizationClientRedirectState, BrowserAuthorizationClientRequestOptions, SettingsInStorage } from "./types";

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
  protected _userManager?: UserManager;

  protected _basicSettings: BrowserAuthorizationClientConfigurationOptions;
  protected _advancedSettings?: UserManagerSettings;

  protected _accessToken: AccessToken = "";
  protected _expiresAt?: Date;

  public constructor(configuration: BrowserAuthorizationClientConfiguration) {
    BrowserAuthorizationLogger.initializeLogger();

    this._basicSettings = {
      ...configuration,
      authority: configuration.authority ?? getImsAuthority(),
    };
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

  public get authorityUrl(): string {
    return this._advancedSettings?.authority ?? this._basicSettings.authority;
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
   * @param basicSettings
   * @param advancedSettings
   * @returns a promise resolving to UserManagerSettings
   */
  protected async getUserManagerSettings(basicSettings: BrowserAuthorizationClientConfiguration, advancedSettings?: UserManagerSettings): Promise<UserManagerSettings> {
    let userManagerSettings: UserManagerSettings = {
      authority: this.authorityUrl,
      redirect_uri: basicSettings.redirectUri, // eslint-disable-line @typescript-eslint/naming-convention
      client_id: basicSettings.clientId, // eslint-disable-line @typescript-eslint/naming-convention
      scope: basicSettings.scope,
      post_logout_redirect_uri: basicSettings.postSignoutRedirectUri, // eslint-disable-line @typescript-eslint/naming-convention
      response_type: basicSettings.responseType, // eslint-disable-line @typescript-eslint/naming-convention
      automaticSilentRenew: true,
      silent_redirect_uri: basicSettings.silentRedirectUri, // eslint-disable-line @typescript-eslint/naming-convention
      userStore: new WebStorageStateStore({ store: window.localStorage }),
      prompt: basicSettings.prompt,
      response_mode: basicSettings.responseMode, // eslint-disable-line @typescript-eslint/naming-convention
    };

    if (advancedSettings) {
      userManagerSettings = { ...userManagerSettings, ...advancedSettings };
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
   * Alias for signInRedirect
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
   * @param successRedirectUrl - (optional) path to redirect to after a successful authorization
   * @param args (optional) additional BrowserAuthorizationClientRequestOptions passed to signIn methods
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

    const redirectArgs = { state, ...args };
    await userManager.signinRedirect(redirectArgs); // This call changes the window's URL, which effectively ends execution here unless an exception is thrown.
  }

  /**
   * Attempts a sign-in via popup with the authorization provider
   * @param args - @see BrowserAuthorizationClientRequestOptions
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
      user = await userManager.signinSilent() ?? undefined; // calls events
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
    this._expiresAt = user.expires_at ? new Date(user.expires_at * 1000) : undefined;
  }

  /**
   * Alias for signOutRedirect
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
   * @returns an AccessToken
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
    } catch (err: any) {
      Logger.logError(BrowserAuthorizationLoggerCategory.Authorization, "Error thrown when handing BrowserAuthorizationClient.onUserStateChanged event", () => ({ message: err.message }));
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

  /**
   * Attempts to process a callback response in the current URL.
   * When called successfully within an iframe or popup, the host frame will automatically be destroyed.
   * @param responseMode - Defines how OIDC auth reponse parameters are encoded.
   * @throws [[Error]] when this attempt fails for any reason.
   */
  private async handleSigninCallbackInternal(responseMode: "query" | "fragment"): Promise<void> {
    const userManager = await this.getUserManager();
    // oidc-client-js uses an over-eager regex to parse the url, which may match values from the hash string when targeting the query string (and vice-versa)
    // To ensure that this mismatching doesn't occur, we strip the unnecessary portion away here first.
    const urlSuffix = responseMode === "query"
      ? window.location.search
      : window.location.hash;
    const url = `${window.location.origin}${window.location.pathname}${urlSuffix}`;

    const user = await userManager.signinCallback(url); // For silent or popup callbacks, execution effectively ends here, since the context will be destroyed.
    if (!user || user.expired)
      throw new Error("Authorization error: userManager.signinRedirectCallback does not resolve to authorized user");

    if (user.state) {
      const state = user.state as BrowserAuthorizationClientRedirectState;
      if (state.successRedirectUrl) { // Special case for signin via redirect used to return to the original location
        window.location.replace(state.successRedirectUrl);
      }
    }
  }

  /**
   * Attempts to parse an OIDC token from the current window URL
   * When called within an iframe or popup, the host frame will automatically be destroyed before the promise resolves.
   */
  public async handleSigninCallback(): Promise<void> {
    const url = new URL(this._basicSettings.redirectUri);
    if (url.pathname !== window.location.pathname)
      return;

    let errorMessage = "";

    try {
      await this.handleSigninCallbackInternal("fragment");
      return;
    } catch (err: any) {
      errorMessage += `${err.message}\n`;
    }

    try {
      await this.handleSigninCallbackInternal("query");
      return;
    } catch (err: any) {
      errorMessage += `${err.message}\n`;
    }

    if (window.self !== window.top) { // simply destroy the window if a failure is detected in an iframe.
      window.close();
      return;
    }

    errorMessage = `SigninCallback error - failed to process signin request in callback using all known modes of token delivery: ${errorMessage}`;
    UnexpectedErrors.handle(new Error(errorMessage));
  }

  public static async handleSignInCallback() {
    const StaticClient = new BrowserAuthorizationClient({} as any);
    this.tryLoadSettingsFromStorage(StaticClient);
    await StaticClient.handleSigninCallback();
  }

  private static tryLoadSettingsFromStorage(
    client: BrowserAuthorizationClient
  ) {
    const url = new URL(window.location.href);
    const nonce = url.searchParams.get("state");

    const storageEntry = window.localStorage.getItem(`oidc.${nonce}`);
    if (!storageEntry)
      throw new Error("Could not load oidc settings from local storage. Ensure the client is configured properly");

    const storageObject: SettingsInStorage = JSON.parse(storageEntry);

    const transformed = {
      ...storageObject,
      clientId: storageObject.client_id,
      redirectUri: storageObject.redirect_uri,
      authority: storageObject.authority,
    };

    client._basicSettings = transformed;
  }
}