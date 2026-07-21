/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BentleyError, Logger } from "@itwin/core-bentley";
import type { TokenResponseJson } from "@openid/appauth";
import { TokenResponse } from "@openid/appauth";
import { createCipheriv, createDecipheriv, createSecretKey, randomBytes } from "node:crypto";
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import * as path from "node:path";
import * as NodePersist from "node-persist";
import { NODE_CLI_AUTH_LOGGER_CATEGORY } from "./Client";
import type { TokenEncryption } from "./TokenEncryption";

type CacheEntry = TokenResponseJson & { scopesForCacheValidation?: string };

/** Cache entry encrypted with the built-in AES-256-GCM cipher (hex-encoded, with its IV and auth tag). */
interface BuiltInEncryptedEntry {
  encryptedCache: string;
  iv: string;
  authTag: string;
}

/** Cache entry encrypted via a custom {@link TokenEncryption} hook (base64-encoded). */
interface CustomEncryptedEntry {
  encryptedCache: string;
}

type StoredCacheEntry = BuiltInEncryptedEntry | CustomEncryptedEntry;

/**
 * Utility to store OIDC AppAuth in secure storage
 * @internal
 */
export class TokenStore {
  private readonly _appStorageKey: string;
  private readonly _scopes: string;
  private readonly _dir: string;
  private readonly _store: NodePersist.LocalStorage;
  private readonly _tokenEncryption?: TokenEncryption;
  private _cipherKey?: Buffer;
  public constructor(namedArgs: { clientId: string, issuerUrl: string, scopes: string }, dir?: string, tokenEncryption?: TokenEncryption) {
    // A stored credential is only valid for a combination of the clientId, the issuing authority and the requested scopes.
    // We make the storage key a combination of clientId and issuing authority so that keys can stay cached when switching
    // between PROD and QA environments.
    // We store the scopes in our password blob so we know if a new token is required due to updated scopes.
    const configFileName = `iTwinJs_${namedArgs.clientId}`;
    this._appStorageKey = `${configFileName}_${namedArgs.issuerUrl}`
      .replace(/[.]/g, "%2E")
      .replace(/[\/]/g, "%2F");
    this._scopes = namedArgs.scopes;
    this._dir = dir ?? path.join(process.cwd(), ".configStore");
    this._tokenEncryption = tokenEncryption;
    this._store = NodePersist.create({
      dir: this._dir,
    });
  }

  public async initialize(): Promise<void> {
    await this._store.init();
  }
  private _userName?: string;
  private async getUserName(): Promise<string | undefined> {
    if (!this._userName)
      this._userName = await (await import("username")).username();
    return this._userName;
  }

  private async getKey(): Promise<string> {
    const userName = await this.getUserName();
    return `${this._appStorageKey}${userName}`;
  }

  private getKeyFilePath(): string {
    return path.join(this._dir, ".token-store.key");
  }

  /**
   * Loads the cipher key from disk if present, otherwise generates a random 32-byte key and
   * persists it for reuse.
   * @note POSIX only: protects against another local user reading/tampering with the key file
   * (the same bar OpenSSH holds itself to for `~/.ssh/id_rsa`), not against malware running as
   * the same user. Not hardened on Windows - use a {@link TokenEncryption} hook there instead.
   */
  private getCipherKey(): Buffer {
    if (this._cipherKey)
      return this._cipherKey;

    this.ensureSecureStoreDirectory();

    const keyFilePath = this.getKeyFilePath();
    const existingKey = this.readTrustedKeyFile(keyFilePath);
    if (existingKey) {
      this._cipherKey = existingKey;
      return this._cipherKey;
    }

    this._cipherKey = this.createKeyFile(keyFilePath);
    return this._cipherKey;
  }

  /** Ensures the store directory exists and (POSIX only) is owner-only. */
  private ensureSecureStoreDirectory(): void {
    if (!existsSync(this._dir))
      mkdirSync(this._dir, { recursive: true, mode: 0o700 });

    if (process.platform !== "win32") {
      try {
        chmodSync(this._dir, 0o700);
      } catch (err) {
        // May not own the directory - move on.
        Logger.logTrace(NODE_CLI_AUTH_LOGGER_CATEGORY, `Unable to restrict permissions on token store directory ${this._dir}`, () => BentleyError.getErrorProps(err));
      }
    }
  }

  /**
   * Reads the key file only if it's a regular file (never a symlink), owned by the current user,
   * with no group/other access (POSIX only), and a well-formed 32-byte key. Otherwise it's
   * discarded so a fresh key can replace it.
   */
  private readTrustedKeyFile(keyFilePath: string): Buffer | undefined {
    let stat;
    try {
      stat = lstatSync(keyFilePath);
    } catch {
      return undefined;
    }

    const key = this.isTrustedKeyFileStat(stat) ? readFileSync(keyFilePath) : undefined;
    if (key?.length === 32)
      return key;

    try {
      unlinkSync(keyFilePath);
    } catch (err) {
      Logger.logTrace(NODE_CLI_AUTH_LOGGER_CATEGORY, `Unable to delete untrusted cipher key file ${keyFilePath}`, () => BentleyError.getErrorProps(err));
    }
    return undefined;
  }

  /**
   * @note Not yet hardened on Windows: POSIX uid/mode bits aren't meaningful there, so any regular
   * file at the key path is trusted as-is. Use a {@link TokenEncryption} hook for a real guarantee.
   */
  private isTrustedKeyFileStat(stat: { isFile(): boolean, isSymbolicLink?(): boolean, uid?: number, mode: number }): boolean {
    if (!stat.isFile())
      return false; // never follow/trust symlinks or other special files

    if (process.platform === "win32")
      return true;

    const ownedByCurrentUser = typeof process.getuid !== "function" || stat.uid === process.getuid();
    const noGroupOrOtherAccess = (stat.mode & 0o077) === 0;
    return ownedByCurrentUser && noGroupOrOtherAccess;
  }

  /**
   * Creates the key file with `O_CREAT | O_EXCL` (create-new-file-only; fails instead of
   * following a symlink or overwriting anything already at that path).
   */
  private createKeyFile(keyFilePath: string): Buffer {
    const newKey = randomBytes(32); // aes-256-gcm requires a key length of 32 bytes.
    try {
      const fd = openSync(keyFilePath, "wx", 0o600);
      try {
        // writeSync isn't guaranteed to write the whole buffer in one call - keep writing until it's all out.
        let written = 0;
        while (written < newKey.length)
          written += writeSync(fd, newKey, written);
      } finally {
        closeSync(fd);
      }
      return newKey;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        // Lost a race, or something was (re-)planted - only proceed if it now passes the trust check.
        const raced = this.readTrustedKeyFile(keyFilePath);
        if (raced)
          return raced;
        throw new Error(`Unable to safely create the refresh token cache's cipher key file at ${keyFilePath}.`);
      }
      throw err;
    }
  }

  /**
   * Encrypts the given cache entry, using the supplied {@link TokenEncryption} hook if one was provided,
   * otherwise falling back to the built-in AES-256-GCM cipher (keyed by {@link getCipherKey}).
   */
  private async encryptCache(cacheEntry: CacheEntry): Promise<StoredCacheEntry> {
    const plaintext = JSON.stringify(cacheEntry);

    if (this._tokenEncryption) {
      const encryptedBuffer = await this._tokenEncryption.encrypt(plaintext);
      return { encryptedCache: encryptedBuffer.toString("base64") };
    }

    const iv = randomBytes(12);
    const key = createSecretKey(new Uint8Array(this.getCipherKey()));
    const cipher = createCipheriv("aes-256-gcm", key, new Uint8Array(iv));
    const encryptedCache = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
    const authTag = cipher.getAuthTag();
    return { encryptedCache, iv: iv.toString("hex"), authTag: authTag.toString("hex") };
  }

  /**
   * Decrypts a cache entry previously produced by {@link encryptCache}.
   * @throws if the stored entry's format doesn't match the currently configured encryption, or if
   * decryption otherwise fails. Callers should treat any error as a cache miss.
   */
  private async decryptCache(storedObj: StoredCacheEntry): Promise<string> {
    if (!("iv" in storedObj)) {
      if (!this._tokenEncryption)
        throw new Error("Stored cache entry was encrypted with a custom tokenEncryption hook, but none is configured.");
      return this._tokenEncryption.decrypt(Buffer.from(storedObj.encryptedCache, "base64"));
    }

    if (this._tokenEncryption)
      throw new Error("Stored cache entry was encrypted with the built-in cipher, but a custom tokenEncryption hook is configured.");

    if (!("authTag" in storedObj))
      throw new Error("Stored cache entry is missing the AES-256-GCM auth tag.");

    const key = createSecretKey(new Uint8Array(this.getCipherKey()));
    const decipher = createDecipheriv("aes-256-gcm", key, new Uint8Array(Buffer.from(storedObj.iv, "hex")));
    decipher.setAuthTag(new Uint8Array(Buffer.from(storedObj.authTag, "hex")));
    return decipher.update(storedObj.encryptedCache, "hex", "utf8") + decipher.final("utf8");
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
    const storedObj: StoredCacheEntry = await this._store.getItem(key);

    let tokenResponseObj: CacheEntry;
    try {
      const cacheEntry = await this.decryptCache(storedObj);
      // Only reuse token if matching scopes. Don't include cache data for TokenResponse object.
      tokenResponseObj = JSON.parse(cacheEntry) as CacheEntry;
    } catch {
      // Undecryptable/unparsable (old key, mismatched scheme, or corrupted) - discard and re-auth.
      await this._store.removeItem(key);
      return undefined;
    }

    if (tokenResponseObj?.scopesForCacheValidation !== this._scopes) {
      await this._store.removeItem(key);
      return undefined;
    }
    delete tokenResponseObj.scopesForCacheValidation;

    return new TokenResponse(tokenResponseObj);
  }

  public async remove(): Promise<void> {
    if (process.platform === "linux")
      return;

    const key = await this.getKey();
    await this._store.removeItem(key);
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
    const objToStore = await this.encryptCache(cacheEntry);
    const key = await this.getKey();
    await this._store.setItem(key, objToStore);
  }
}
