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
  private readonly _appStorageKey: string;
  private readonly _scopes: string;

  public constructor(namedArgs: {clientId: string, issuerUrl: string, scopes: string}) {
    // A stored credential is only valid for a combination of the clientId, the issuing authority and the requested scopes.
    // We make the storage key a combination of clientId and issuing authority so that keys can stay cached when switching
    // between PROD and QA environments.
    // We store the scopes in our password blob so we know if a new token is required due to updated scopes.
    this._appStorageKey = `iTwinJs:${namedArgs.clientId}:${namedArgs.issuerUrl}`;
    this._scopes = namedArgs.scopes;
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

    // Only reuse token if matching scopes. Don't include cache data for TokenResponse object.
    const tokenResponseObj = JSON.parse(tokenResponseStr);
    if (tokenResponseObj?.scopesForCacheValidation !== this._scopes)
      return undefined;
    delete tokenResponseObj.scopesForCacheValidation;

    return new TokenResponse(tokenResponseObj);
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

    // TokenResponse.scope is always empty in my testing, so manually add to object instead
    const cacheEntry = {
      scopesForCacheValidation: this._scopes,
      ...tokenResponseObj.toJson(),
    };

    await setPassword(this._appStorageKey, userName, JSON.stringify(cacheEntry));
  }
}
