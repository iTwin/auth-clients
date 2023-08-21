/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as OperatingSystemUserName from "username";
import { TokenResponse } from "@openid/appauth";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import * as path from "node:path";
import * as NodePersist from "node-persist";

/**
 * Utility to store OIDC AppAuth in secure storage
 * @internal
 */
export class TokenStore {
  private readonly _appStorageKey: string;
  private readonly _scopes: string;
  private readonly _store: NodePersist.LocalStorage;
  public constructor(namedArgs: {clientId: string, issuerUrl: string, scopes: string}, dir?: string) {
    // A stored credential is only valid for a combination of the clientId, the issuing authority and the requested scopes.
    // We make the storage key a combination of clientId and issuing authority so that keys can stay cached when switching
    // between PROD and QA environments.
    // We store the scopes in our password blob so we know if a new token is required due to updated scopes.
    const configFileName = `iTwinJs_${namedArgs.clientId}`;
    this._appStorageKey = `${configFileName}_${namedArgs.issuerUrl}`
      .replace(/[.]/g, "%2E") // Replace all '.' with URL Percent-encoding representation
      .replace(/[\/]/g, "%2F"); // Replace all '/' with URL Percent-encoding representation;
    this._scopes = namedArgs.scopes;
    this._store = NodePersist.create({
      dir: dir ?? path.join(process.cwd(), ".configStore"), // specifies storage file path.
    });
  }

  public async initialize(): Promise<void> {
    await this._store.init();
  }
  private _userName?: string;
  private async getUserName(): Promise<string | undefined> {
    if (!this._userName)
      this._userName = await OperatingSystemUserName();
    return this._userName;
  }

  private async getKey(): Promise<string> {
    const userName = await this.getUserName();
    return `${this._appStorageKey}${userName}`;
  }

  /**
   * Generate a viable cipher key from a password based derivation function (scrypt).
   * @returns
   */
  private generateCipherKey(): Buffer {
    return scryptSync(this._appStorageKey, "iTwin", 32); // aes-256-cbc requires a key length of 32 bytes.
  }
  /**
   * Uses node's native `crypto` module to encrypt the given cache entry.
   * @returns an object containing a hexadecimal encoded token, returned as a string, as well as the initialization vector.
   */
  private encryptCache(cacheEntry: object): {encryptedCache: string, iv: string} {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", this.generateCipherKey(), iv);

    const encryptedCache = cipher.update(JSON.stringify(cacheEntry), "utf8", "hex") + cipher.final("hex");
    return {
      encryptedCache,
      iv: iv.toString("hex"),
    };
  }

  private decryptCache(encryptedCache: string, iv: Buffer): string {
    const decipher = createDecipheriv("aes-256-cbc", this.generateCipherKey(), iv);
    const decryptedCache = decipher.update(encryptedCache, "hex", "utf8") + decipher.final("utf8");
    return decryptedCache;
  }

  public async load(): Promise<TokenResponse | undefined> {
    if (process.platform === "linux")
      return undefined;

    const userName = await this.getUserName();
    if (!userName)
      return undefined;

    const key = await this.getKey();
    const storeKeys = await this._store.keys();
    if (!storeKeys.includes(key)) {
      return undefined;
    }
    const storedObj = await this._store.getItem(key);
    const encryptedCache = storedObj.encryptedCache;
    const iv = storedObj.iv;
    const cacheEntry = this.decryptCache(encryptedCache, Buffer.from(iv, "hex"));
    // Only reuse token if matching scopes. Don't include cache data for TokenResponse object.
    const tokenResponseObj = JSON.parse(cacheEntry);
    if (tokenResponseObj?.scopesForCacheValidation !== this._scopes) {
      await this._store.removeItem(key);
      return undefined;
    }
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
    const objToStore = this.encryptCache(cacheEntry);
    const key = await this.getKey();
    await this._store.setItem(key, objToStore);
  }
}
