/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { getPassword, setPassword } from "keytar";
import * as OperatingSystemUserName from "username";
import { TokenResponse } from "@openid/appauth";

/**
 * Utility to store OIDC AppAuth in secure storage
 */
export class TokenStore {
  private _appStorageKey: string;

  public constructor(appStorageKey: string) {
    this._appStorageKey = appStorageKey;
  }

  private _userName?: string;
  private async getUserName(): Promise<string | undefined> {
    if (!this._userName)
      this._userName = await OperatingSystemUserName();
    return this._userName;
  }

  public async load(): Promise<TokenResponse | undefined> {
    if (process.platform === "linux")
      return undefined;

    const userName = await this.getUserName();
    if (!userName)
      return;

    const tokenResponseStr = await getPassword(this._appStorageKey, userName);
    if (!tokenResponseStr)
      return undefined;

    return new TokenResponse(JSON.parse(tokenResponseStr));
  }

  public async save(tokenResponse: TokenResponse): Promise<void> {
    if (process.platform === "linux")
      return undefined;

    const userName = await this.getUserName();
    if (!userName)
      return;

    const tokenResponseObj = new TokenResponse(tokenResponse.toJson()); // Workaround for 'stub received bad data' error on windows - see https://github.com/atom/node-keytar/issues/112
    tokenResponseObj.accessToken = "";
    tokenResponseObj.idToken = "";

    await setPassword(this._appStorageKey, userName, JSON.stringify(tokenResponseObj.toJson()));
  }
}
