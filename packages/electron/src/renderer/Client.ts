/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Renderer
 */

import type { AccessToken } from "@itwin/core-bentley";
import { BeEvent } from "@itwin/core-bentley";
import type { AuthorizationClient, IpcSocketFrontend } from "@itwin/core-common";
import { defaultExpiryBufferInSeconds } from "../common/constants";
import type { IpcChannelNames } from "../common/IpcChannelNames";
import { getIpcChannelNames } from "../common/IpcChannelNames";
import type { ITwinElectronApi } from "./ElectronPreload";

/**
 * Frontend Ipc support for Electron apps.
 */
class ElectronAuthIPC {
  private _ipcChannelNames: IpcChannelNames;
  private _ipcSocket: IpcSocketFrontend | ITwinElectronApi;

  public async signIn(): Promise<void> {
    return this._ipcSocket.invoke(this._ipcChannelNames.signIn);
  }

  public async signOut(): Promise<void> {
    return this._ipcSocket.invoke(this._ipcChannelNames.signOut);
  }

  public async getAccessToken(): Promise<AccessToken> {
    return this._ipcSocket.invoke(this._ipcChannelNames.getAccessToken);
  }

  public addAccessTokenChangeListener(callback: (event: any, token: string) => void) {
    this._ipcSocket.addListener(this._ipcChannelNames.onAccessTokenChanged, callback);
  }

  public addAccessTokenExpirationChangeListener(callback: (event: any, expiresAt: Date) => void) {
    this._ipcSocket.addListener(this._ipcChannelNames.onAccessTokenExpirationChanged, callback);
  }

  public async signInSilent(): Promise<void> {
    return this._ipcSocket.invoke(this._ipcChannelNames.signInSilent);
  }

  constructor(ipcChannelNames: IpcChannelNames, ipcSocket?: IpcSocketFrontend) {
    this._ipcChannelNames = ipcChannelNames;
    if (ipcSocket) {
      this._ipcSocket = ipcSocket;
    } else {
      // use the methods on window.itwinjs exposed by ElectronPreload.ts, or ipcRenderer directly if running with nodeIntegration=true (**only** for tests).
      // Note that `require("electron")` doesn't work with nodeIntegration=false - that's what it stops
      this._ipcSocket = (window as any).itwinjs ?? require("electron").ipcRenderer; // eslint-disable-line @typescript-eslint/no-var-requires
    }
  }
}

/**
 * Client configuration to generate OIDC/OAuth tokens for native applications
 * @beta
 */
export interface ElectronRendererAuthorizationConfiguration {
  /** Client application's identifier as registered with the OIDC/OAuth2 provider. */
  readonly clientId: string;

  /**
   * Optional custom implementation of {@link IpcSocketFrontend} to use for IPC communication with the Backend counterpart of
   * authorization client, see {@link ../ElectronMainAuthorization}. If not provided, default IPC implementation is used.
   */
  readonly ipcSocket?: IpcSocketFrontend;

  /**
   * Time in seconds that's used as a buffer to check the token for validity/expiry.
   * The checks for authorization, and refreshing access tokens all use this buffer - i.e., the token is considered expired if the current time is within the specified
   * time of the actual expiry.
   * @note If unspecified this defaults to 10 minutes.
   */
  readonly expiryBuffer?: number;

  /**
   * Optional prefix to use for IPC channel names. Useful to avoid conflicts when multiple clients are used in the same application.
   */
  readonly channelClientPrefix?: string;
}

/**
 * Object to be set as `IModelApp.authorizationClient` for the frontend of ElectronApps.
 * Since Electron Apps use the backend for all authorization, this class sends signIn/signOut requests to the backend
 * and then gets the access token from the backend.
 * @public
 */
export class ElectronRendererAuthorization implements AuthorizationClient {
  private _cachedToken: AccessToken = "";
  private _tokenRequest: Promise<AccessToken> | undefined;
  private _expiresAt?: Date;
  private _expiryBuffer = defaultExpiryBufferInSeconds;
  public readonly onAccessTokenChanged = new BeEvent<(token: AccessToken) => void>();
  public get hasSignedIn() { return this._cachedToken !== ""; }
  public get isAuthorized(): boolean {
    return this.hasSignedIn && !this._hasExpired;
  }
  private _ipcAuthAPI: ElectronAuthIPC;

  /** Constructor for ElectronRendererAuthorization. Sets up listeners for when the access token changes both on the frontend and the backend. */
  public constructor(config: ElectronRendererAuthorizationConfiguration) {
    const ipcChannelNames = getIpcChannelNames(
      config.clientId,
      config.channelClientPrefix
    );
    this._ipcAuthAPI = new ElectronAuthIPC(ipcChannelNames, config.ipcSocket);

    this.onAccessTokenChanged.addListener((token: AccessToken) => {
      this._cachedToken = token;
    });
    this._ipcAuthAPI.addAccessTokenChangeListener((_event: any, token: AccessToken) => {
        this.onAccessTokenChanged.raiseEvent(token);
    });
    this._ipcAuthAPI.addAccessTokenExpirationChangeListener((_event: any, expiration: Date) => {
        this._expiresAt = expiration;
    });

    if (config.expiryBuffer)
      this._expiryBuffer = config.expiryBuffer;
  }

  /**
   * Called to start the sign-in process.
   * Resolves when sign-in completes, rejects if sign-in fails.
   * Subscribe to `onAccessTokenChanged` to be notified when a token is available.
   */
  public async signIn(): Promise<void> {
    await this._ipcAuthAPI.signIn();
  }

  /** Called to start the sign-out process. Subscribe to onAccessTokenChanged to be notified when sign-out completes */
  public async signOut(): Promise<void> {
    await this._ipcAuthAPI.signOut();
  }

  /** Called to start the silent sign-in process. Subscribe to onAccessTokenChanged to be notified when silent sign-in completes */
  public async signInSilent(): Promise<void> {
    await this._ipcAuthAPI.signInSilent();
  }

  /** Returns a promise that resolves to the AccessToken if signed in.
   * - The token is ensured to be valid *at least* for the buffer of time specified by the configuration.
   * - The token is refreshed if it's possible and necessary.
   * - This method must be called to refresh the token - the client does NOT automatically monitor for token expiry.
   * - Getting or refreshing the token will trigger the [[onAccessTokenChanged]] event.
   */
  public async getAccessToken(): Promise<AccessToken> {
    // if we have a valid token, return it. Otherwise call backend to refresh the token.
    if (!this.isAuthorized) {
      if (this._tokenRequest) {
        return this._tokenRequest; // short-circuits any recursive use of this function
      }

      try {
        this._tokenRequest = this._ipcAuthAPI.getAccessToken().then((x) => x ?? "");
        this._cachedToken = await this._tokenRequest;
      } catch (err) {
        throw err;
      } finally {
        this._tokenRequest = undefined;
      }
    }

    return this._cachedToken ?? "";
  }

  private get _hasExpired(): boolean {
    if (!this._expiresAt)
      return false;

    return this._expiresAt.getTime() - Date.now() <= this._expiryBuffer * 1000; // Consider this.expireSafety's amount of time early as expired
  }
}
