/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Authorization
 */

import type { UserManagerSettings} from "oidc-client";
import { UserManager, WebStorageStateStore } from "oidc-client";
import { BrowserAuthorizationLogger } from "./Logger";
import type { BrowserAuthorizationClientRedirectState } from "./ClientRedirectState";
import { UnexpectedErrors } from "@itwin/core-bentley";

/**
 * @beta
 */
export interface BrowserAuthorizationCallbackHandlerConfiguration {
  /**
   * Depending upon the mechanism used to authenticate, the signin response may be delivered in either the URL query or fragment strings.
   * If left undefined, the callback handler will check the URL fragment by default.
   * Authorization code responses are expected to be delivered in the query string, while access tokens are delivered via the fragment.
   * Sign-OUT responses are always expected to be delivered in the query string.
   */
  responseMode?: "query" | "fragment" | string;
}

/**
 * @beta
 */
export enum OidcCallbackResponseMode {
  Query = 1 << 0,
  Fragment = 1 << 1,
  /**
   * To be used only when a specific response mode is not known beforehand.
   * Results in attempting all other response modes one-by-one to determine the correct one.
   */
  Unknown = Query | Fragment,
}

/**
 * To be used in conjunction with [[BrowserAuthorizationClient]], which initiates the auth requests that can be handled by this class.
 * @beta
 */
export class BrowserAuthorizationCallbackHandler {
  protected _userManager?: UserManager;

  protected _basicSettings: BrowserAuthorizationCallbackHandlerConfiguration;
  protected _advancedSettings?: UserManagerSettings;

  private constructor(configuration: BrowserAuthorizationCallbackHandlerConfiguration = {}) {
    this._basicSettings = configuration;
    BrowserAuthorizationLogger.initializeLogger();
  }

  protected async getUserManager(): Promise<UserManager> {
    if (this._userManager) {
      return this._userManager;
    }

    const settings = await this.getUserManagerSettings(this._basicSettings, this._advancedSettings);
    this._userManager = new UserManager(settings);
    return this._userManager;
  }

  /**
   * Merges the basic and advanced settings into a single configuration object consumable by the internal userManager.
   * @param requestContext
   * @param basicSettings
   * @param advancedSettings
   */
  protected async getUserManagerSettings(basicSettings: BrowserAuthorizationCallbackHandlerConfiguration, advancedSettings?: UserManagerSettings): Promise<UserManagerSettings> {
    let userManagerSettings: UserManagerSettings = {
      response_mode: basicSettings.responseMode, // eslint-disable-line @typescript-eslint/naming-convention
      userStore: new WebStorageStateStore({ store: window.localStorage }),
    };

    if (advancedSettings) {
      userManagerSettings = Object.assign(userManagerSettings, advancedSettings);
    }

    return userManagerSettings;
  }

  /**
   * Attempts to process a callback response in the current URL.
   * When called successfully within an iframe or popup, the host frame will automatically be destroyed.
   * @throws [[Error]] when this attempt fails for any reason.
   */
  private async handleSigninCallbackInternal(): Promise<void> {
    const userManager = await this.getUserManager();
    // oidc-client-js uses an over-eager regex to parse the url, which may match values from the hash string when targeting the query string (and vice-versa)
    // To ensure that this mismatching doesn't occur, we strip the unnecessary portion away here first.
    const urlSuffix = userManager.settings.response_mode === "query"
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
   * @param redirectUrl Checked against the current window's URL. If the given redirectUrl and the window's path don't match, no attempt is made to parse the URL for a token.
   */
  public static async handleSigninCallback(redirectUrl: string): Promise<void> {
    const url = new URL(redirectUrl);
    if (url.pathname !== window.location.pathname)
      return;

    let errorMessage = "";
    let callbackHandler = new BrowserAuthorizationCallbackHandler({ responseMode: "fragment" });
    try {
      await callbackHandler.handleSigninCallbackInternal();
      return;
    } catch (err) {
      errorMessage += `${err.message}\n`;
    }

    callbackHandler = new BrowserAuthorizationCallbackHandler({ responseMode: "query" });
    try {
      await callbackHandler.handleSigninCallbackInternal();
      return;
    } catch (err) {
      errorMessage += `${err.message}\n`;
    }

    if (window.self !== window.top) { // simply destroy the window if a failure is detected in an iframe.
      window.close();
      return;
    }

    errorMessage = `SigninCallback error - failed to process signin request in callback using all known modes of token delivery: ${errorMessage}`;
    UnexpectedErrors.handle(new Error(errorMessage));
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
