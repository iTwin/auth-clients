/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

/** @packageDocumentation
 * @module Authentication
 */

import * as OperatingSystemUserName from "username";
import * as semver from "semver";
import * as path from "path";
import * as fs from "fs-extra";
import { TokenResponse, TokenResponseJson } from "@openid/appauth";
import { BentleyError, IModelStatus, Logger } from "@itwin/core-bentley";
import { IModelJsNative, NativeLibrary } from "@bentley/imodeljs-native";

/**
 * Utility to store OIDC AppAuth in secure storage
 * @internal
 */
export class ElectronTokenStore {
  private _appStorageKey: string;
  private _platform: typeof IModelJsNative;

  public constructor(clientId: string) {
    this._appStorageKey = `Bentley.iModelJs.OidcTokenStore.${clientId}`;

    this._platform = NativeLibrary.load();
    this.validateNativePlatformVersion();
    this._platform.logger = Logger;
  }

  private validateNativePlatformVersion(): void {
    const requiredVersion = require("../../package.json").dependencies["@bentley/imodeljs-native"]; // eslint-disable-line @typescript-eslint/no-var-requires
    const thisVersion = this._platform.version;
    if (semver.satisfies(thisVersion, requiredVersion))
      return;
    if (fs.existsSync(path.join(__dirname, "DevBuild.txt"))) {
      console.log("Bypassing version checks for development build"); // eslint-disable-line no-console
      return;
    }
    throw new BentleyError(IModelStatus.BadRequest, `imodeljs-native version is (${thisVersion}). core-backend requires version (${requiredVersion})`);
  }

  private _userName?: string; // Cached user name
  private async getUserName(): Promise<string | undefined> {
    if (!this._userName)
      this._userName = await OperatingSystemUserName();
    return this._userName;
  }

  /** Load token if available */
  public async load(): Promise<TokenResponse | undefined> {
    if (undefined === this._platform.KeyTar) // no keytar on Linux yet
      return undefined;

    const userName = await this.getUserName();
    if (!userName)
      return;

    const tokenResponseStr = await this._platform.KeyTar.getPassword(this._appStorageKey, userName);
    if (!tokenResponseStr) {
      return undefined;
    }

    const tokenResponseJson = JSON.parse(tokenResponseStr) as TokenResponseJson;
    return new TokenResponse(tokenResponseJson);
  }

  /** Save token after signin */
  public async save(tokenResponse: TokenResponse): Promise<void> {
    if (undefined === this._platform.KeyTar) // no keytar on Linux yet
      return;

    const userName = await this.getUserName();
    if (!userName)
      return;

    const tokenResponseObj = new TokenResponse(tokenResponse.toJson()); // Workaround for 'stub received bad data' error on windows - see https://github.com/atom/node-keytar/issues/112
    tokenResponseObj.accessToken = "";
    tokenResponseObj.idToken = "";

    const tokenResponseStr = JSON.stringify(tokenResponseObj.toJson());
    await this._platform.KeyTar.setPassword(this._appStorageKey, userName, tokenResponseStr);
  }

  /** Delete token after signout */
  public async delete(): Promise<void> {
    if (undefined === this._platform.KeyTar) // no keytar on Linux yet
      return;

    const userName = await this.getUserName();
    if (!userName)
      return;

    await this._platform.KeyTar.deletePassword(this._appStorageKey, userName);
  }
}
