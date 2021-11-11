/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AccessToken, BeEvent } from "@itwin/core-bentley";
import { AuthorizationClient } from "@itwin/core-common";
import { ITwinElectronApi } from "./ElectronPreload";

/** @internal */
export enum ElectronAuthIPCChannelNames {
  signIn = "itwin.electron.auth.signIn",
  signOut = "itwin.electron.auth.signOut",
  getAccessToken = "itwin.electron.auth.getAccessToken",
  onAccessTokenChanged = "itwin.electron.auth.onAccessTokenChanged",
  onAccessTokenExpirationChanged = "itwin.electron.auth.onAccessTokenExpirationChanged",
}

/**
 * Frontend Ipc support for Electron apps.
 */
class ElectronAuthIPC  {
  private _api: ITwinElectronApi;
  public async signIn(): Promise<void> {
    await this._api.invoke(ElectronAuthIPCChannelNames.signIn);
  }
  public async signOut(): Promise<void> {
    await this._api.invoke(ElectronAuthIPCChannelNames.signOut);
  }
  public async getAccessToken(): Promise<AccessToken> {
    const token = await this._api.invoke(ElectronAuthIPCChannelNames.getAccessToken);
    return token;
  }
  public addAccessTokenChangeListener(callback: (event: any, token: string) => void) {
    this._api.addListener(ElectronAuthIPCChannelNames.onAccessTokenChanged, callback);
  }
  public addAccessTokenExpirationChangeListener(callback: (event: any, token: Date) => void) {
    this._api.addListener(ElectronAuthIPCChannelNames.onAccessTokenExpirationChanged, callback);
  }
  constructor() {
    // use the methods on window.itwinjs exposed by ElectronPreload.ts, or ipcRenderer directly if running with nodeIntegration=true (**only** for tests).
    // Note that `require("electron")` doesn't work with nodeIntegration=false - that's what it stops
    this._api = (window as any).itwinjs ?? require("electron").ipcRenderer; // eslint-disable-line @typescript-eslint/no-var-requires
  }
}

/**
 * Object to be set as `IModelApp.authorizationClient` for the frontend of ElectronApps.
 * Since Electron Apps use the backend for all authorization, this class sends signIn/signOut requests to the backend
 * and then gets the access token from the backend.
 * @public
 */
export class ElectronAppAuthorization implements AuthorizationClient {
  private _cachedToken: AccessToken = "";
  private _refreshingToken = false;
  private _expiresAt?: Date;
  public readonly onAccessTokenChanged = new BeEvent<(token: AccessToken) => void>();
  public get hasSignedIn() { return this._cachedToken !== ""; }
  public get isAuthorized(): boolean {
    return this.hasSignedIn && !this._hasExpired;
  }
  private _ipcAuthAPI: ElectronAuthIPC = new ElectronAuthIPC();

  /** Constructor for ElectronAppAuthorization. Sets up listeners for when the access token changes both on the frontend and the backend. */
  public constructor() {
    this.onAccessTokenChanged.addListener((token: AccessToken) => {
      this._cachedToken = token;
    });
    this._ipcAuthAPI.addAccessTokenChangeListener((_event: any, token: AccessToken) => {
      this.onAccessTokenChanged.raiseEvent(token);
    });
    this._ipcAuthAPI.addAccessTokenExpirationChangeListener((_event: any, expiration: Date) => {
      this._expiresAt = expiration;
    });
  }

  /** Called to start the sign-in process. Subscribe to onUserStateChanged to be notified when sign-in completes */
  public async signIn(): Promise<void> {
    await this._ipcAuthAPI.signIn();
  }

  /** Called to start the sign-out process. Subscribe to onUserStateChanged to be notified when sign-out completes */
  public async signOut(): Promise<void> {
    await this._ipcAuthAPI.signOut();
  }

  /** Returns a promise that resolves to the AccessToken if signed in.
   * - The token is ensured to be valid *at least* for the buffer of time specified by the configuration.
   * - The token is refreshed if it's possible and necessary.
   * - This method must be called to refresh the token - the client does NOT automatically monitor for token expiry.
   * - Getting or refreshing the token will trigger the [[onUserStateChanged]] event.
   */
  public async getAccessToken(): Promise<AccessToken> {
    // if we have a valid token, return it. Otherwise call backend to refresh the token.
    if (!this.isAuthorized) {
      if (this._refreshingToken) {
        return Promise.reject(); // short-circuits any recursive use of this function
      }

      try{
        this._refreshingToken = true;
        this._cachedToken = (await this._ipcAuthAPI.getAccessToken()) ?? "";
      } catch (err) {
        throw err;
      } finally {
        this._refreshingToken = false;
      }
    }

    return this._cachedToken ?? "";
  }

  private get _hasExpired(): boolean {
    if (!this._expiresAt)
      return false;

    return this._expiresAt.getTime() - Date.now() <= 1 * 60 * 1000; // Consider 1 minute before expiry as expired
  }
}
