/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

/** @packageDocumentation
 * @module Authentication
 */

import * as OperatingSystemUserName from "username";
import { deletePassword, getPassword, setPassword } from "keytar";

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

  public constructor(appStorageKey: string) {
    this._appStorageKey = appStorageKey;
  }

  private async getUserName(): Promise<string | undefined> {
    if (!this._userName) {
      try {
        this._userName = await OperatingSystemUserName();
      }
      catch {
        this._userName = OperatingSystemUserName.sync();
      }
    }

    return this._userName;
  }

  /** Load refresh token if available */
  public async load(): Promise<string | undefined> {
    const userName = await this.getUserName();
    if (!userName)
      return undefined;

    const refreshToken = await getPassword(this._appStorageKey, userName);

    return refreshToken || undefined;
  }

  /** Save refresh token after signin */
  public async save(refreshToken: string): Promise<void> {
    const userName = await this.getUserName();
    if (!userName)
      return;

    await setPassword(this._appStorageKey, userName, refreshToken);
  }

  /** Delete refresh token after signout */
  public async delete(): Promise<void> {
    const userName = await this.getUserName();
    if (!userName)
      return;

    await deletePassword(this._appStorageKey, userName);
  }
}
