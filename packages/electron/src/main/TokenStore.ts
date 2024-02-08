/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

import * as OperatingSystemUserName from "username";
import { safeStorage } from "electron";
// eslint-disable-next-line @typescript-eslint/naming-convention
const Store = require("electron-store"); // eslint-disable-line @typescript-eslint/no-var-requires
/**
 * Utility class used to store and read OAuth refresh tokens.
 * @internal
 */
export class RefreshTokenStore {
  /**
   * Key that will be used to store and read refresh token from OS level secure credential store,
   * see {@link setPassword}, {@link getPassword}.
   */
  private _appStorageKey: string;
  /**
   * Cached name of the currently logged in system (OS) user.
   */
  private _userName?: string;

  private _store: typeof Store;

  public constructor(configFileName: string, appStorageKey: string, dir?: string) {
    this._appStorageKey = appStorageKey
      .replace(/[.]/g, "%2E") // Replace all '.' with URL Percent-encoding representation
      .replace(/[\/]/g, "%2F"); // Replace all '/' with URL Percent-encoding representation
    this._store = new Store({
      name: configFileName, // specifies storage file name.
      encryptionKey: "iTwin", // obfuscates the storage file's content, in case a user finds the file and wants to modify it.
      cwd: dir ?? null, // specifies where to the storage file will be saved.
    });
  }

  private async getUserName(): Promise<string | undefined> {
    if (!this._userName) {
      try {
        this._userName = await OperatingSystemUserName();
      } catch {
        // errors occur in testing when using asynchronous call
        // https://github.com/iTwin/auth-clients/issues/163
        this._userName = OperatingSystemUserName.sync();
      }
    }

    return this._userName;
  }

  // Note: this is intentionally made async in case this code doesn't run in electron's main process and safeStorage must be polyfilled with async function
  private async encryptRefreshToken(token: string): Promise<Buffer> {
    return safeStorage.encryptString(token);
  }

  // Note: this is intentionally made async in case this code doesn't run in electron's main process and safeStorage must be polyfilled with async function
  private async decryptRefreshToken(encryptedToken: Buffer): Promise<string> {
    return safeStorage.decryptString(Buffer.from(encryptedToken));
  }

  private async getKey(): Promise<string> {
    const userName = await this.getUserName();
    return `${this._appStorageKey}${userName}`;
  }

  /** Load refresh token if available */
  public async load(): Promise<string | undefined> {
    const userName = await this.getUserName();
    if (!userName)
      return undefined;

    const key = await this.getKey();
    if (!this._store.has(key)) {
      return undefined;
    }
    const encryptedToken = this._store.get(key);
    const refreshToken = await this.decryptRefreshToken(encryptedToken);
    return refreshToken;
  }

  /** Save refresh token after signin */
  public async save(refreshToken: string): Promise<void> {
    const userName = await this.getUserName();
    if (!userName)
      return;
    const encryptedToken = await this.encryptRefreshToken(refreshToken);
    const key = await this.getKey();
    this._store.set(key, encryptedToken);
  }

  /** Delete refresh token after signout */
  public async delete(): Promise<void> {
    const userName = await this.getUserName();
    if (!userName)
      return;

    const key = await this.getKey();
    await this._store.delete(key);
  }
}
