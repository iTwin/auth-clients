/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

import * as OperatingSystemUserName from "username";
import * as keytar from "keytar";
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
  public constructor(configFileName: string, appStorageKey: string) {
    this._appStorageKey = appStorageKey;
    this._store = new Store({
      name: configFileName, // specifies storage file name.
      encryptionKey: "iTwin", // obfuscates the storage file's content, in case a user finds the file and wants to modify it.
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

  private async migrate(oldKeytarRefreshToken: string): Promise<void> {
    await this.delete();
    await this.save(oldKeytarRefreshToken);
  }

  private encryptRefreshToken(token: string): Buffer {
    return safeStorage.encryptString(token);
  }

  private decryptRefreshToken(encryptedToken: Buffer): string {
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

    // If existing refresh token from keytar was found, perform migration from keytar to electron's safeStorage
    const keytarRefreshToken = await keytar.getPassword(this._appStorageKey, userName);
    if (keytarRefreshToken) {
      await this.migrate(keytarRefreshToken);
    }

    const key = await this.getKey();
    if (!this._store.has(key)) {
      return undefined;
    }
    const encryptedToken = this._store.get(key);
    const refreshToken = this.decryptRefreshToken(encryptedToken);
    return refreshToken;
  }

  /** Save refresh token after signin */
  public async save(refreshToken: string): Promise<void> {
    const userName = await this.getUserName();
    if (!userName)
      return;
    const encryptedToken = this.encryptRefreshToken(refreshToken);
    const key = await this.getKey();
    this._store.set(key, encryptedToken);
  }

  /** Delete refresh token after signout */
  public async delete(): Promise<void> {
    const userName = await this.getUserName();
    if (!userName)
      return;

    await keytar.deletePassword(this._appStorageKey, userName);
    const key = await this.getKey();
    await this._store.delete(key);
  }
}
