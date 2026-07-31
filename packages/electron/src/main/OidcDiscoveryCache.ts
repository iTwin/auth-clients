/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { AuthorizationServiceConfigurationJson } from "@openid/appauth";
import { AuthorizationServiceConfiguration } from "@openid/appauth";
import { safeStorage } from "electron";
const Store = require("electron-store"); // eslint-disable-line @typescript-eslint/no-require-imports, @typescript-eslint/naming-convention

const cacheVersion = 1;
const maximumCacheAgeSeconds = 24 * 60 * 60;

interface CachedDiscoveryConfiguration {
  version: typeof cacheVersion;
  issuer: string;
  expiresAt: number;
  configuration: AuthorizationServiceConfigurationJson;
}

interface DiscoveryDocument extends AuthorizationServiceConfigurationJson {
  issuer: string;
}

/** Persistently caches validated OIDC discovery metadata. */
export class OidcDiscoveryCache {
  private readonly _issuer: string;
  private readonly _store: typeof Store;
  private readonly _cacheKey: string;

  public constructor(issuer: string, dir?: string) {
    this._issuer = issuer;
    this._cacheKey = encodeCacheKey(issuer);
    this._store = new Store({
      name: "iTwinJs_oidcDiscoveryCache",
      encryptionKey: "iTwin",
      cwd: dir ?? null,
    });
  }

  public async getConfiguration(): Promise<AuthorizationServiceConfiguration> {
    const cached = await this.load();
    if (cached) return new AuthorizationServiceConfiguration(cached);

    const response = await fetch(
      `${this._issuer}/.well-known/openid-configuration`,
      {
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok)
      throw new Error(
        `Failed to retrieve OpenID configuration from authority: ${response.status}`,
      );

    const document = (await response.json()) as DiscoveryDocument;
    this.validate(document);

    const configuration = new AuthorizationServiceConfiguration(document);
    const expiresAt = this.getExpiration(response.headers);
    if (expiresAt)
      await this.save({
        version: cacheVersion,
        issuer: this._issuer,
        expiresAt,
        configuration: configuration.toJson(),
      });

    return configuration;
  }

  private async load(): Promise<
    AuthorizationServiceConfigurationJson | undefined
  > {
    if (!this._store.has(this._cacheKey)) return undefined;

    try {
      const encrypted = this._store.get(this._cacheKey) as Buffer;
      const cached = JSON.parse(
        await this.decrypt(encrypted),
      ) as CachedDiscoveryConfiguration;
      const maximumExpiration = Date.now() + maximumCacheAgeSeconds * 1000;
      if (
        cached.version !== cacheVersion ||
        cached.issuer !== this._issuer ||
        typeof cached.expiresAt !== "number" ||
        !Number.isFinite(cached.expiresAt) ||
        cached.expiresAt <= Date.now() ||
        cached.expiresAt > maximumExpiration
      ) {
        this._store.delete(this._cacheKey);
        return undefined;
      }

      this.validate({ issuer: cached.issuer, ...cached.configuration });
      return cached.configuration;
    } catch {
      this._store.delete(this._cacheKey);
      return undefined;
    }
  }

  private async save(cached: CachedDiscoveryConfiguration): Promise<void> {
    try {
      this._store.set(
        this._cacheKey,
        await this.encrypt(JSON.stringify(cached)),
      );
    } catch {
      // Discovery caching is an optimization; failure to persist must not prevent authorization.
    }
  }

  private getExpiration(headers: Headers): number | undefined {
    const cacheControl = headers.get("cache-control");
    if (
      !cacheControl ||
      /(?:^|,)\s*(?:no-store|no-cache)\s*(?:,|$)/i.test(cacheControl)
    )
      return undefined;

    const maxAgeMatch = /(?:^|,)\s*max-age\s*=\s*"?(\d+)"?/i.exec(cacheControl);
    if (!maxAgeMatch) return undefined;

    const maxAge = Math.min(
      Number.parseInt(maxAgeMatch[1], 10),
      maximumCacheAgeSeconds,
    );
    return maxAge > 0 ? Date.now() + maxAge * 1000 : undefined;
  }

  private validate(document: DiscoveryDocument): void {
    if (document.issuer !== this._issuer)
      throw new Error(
        "OIDC discovery response issuer does not match the configured issuer",
      );

    for (const [name, endpoint] of [
      ["authorization_endpoint", document.authorization_endpoint],
      ["token_endpoint", document.token_endpoint],
      ["revocation_endpoint", document.revocation_endpoint],
    ]) {
      if (typeof endpoint !== "string" || endpoint.length === 0)
        throw new Error(`OIDC discovery response is missing ${name}`);
    }

    const issuer = new URL(this._issuer);
    if (issuer.protocol !== "https:")
      throw new Error("OIDC issuer must use HTTPS");

    for (const endpoint of [
      document.authorization_endpoint,
      document.token_endpoint,
      document.revocation_endpoint,
      document.end_session_endpoint,
      document.userinfo_endpoint,
    ]) {
      if (!endpoint) continue;

      if (!isValidEndpointUrl(endpoint, issuer))
        throw new Error(
          `OIDC endpoints must use HTTPS and Bentley endpoints must use the configured issuer origin: issuer=${issuer}, endpoint=${endpoint}`,
        );
    }
  }

  private async encrypt(value: string): Promise<Buffer> {
    return safeStorage.encryptString(value);
  }

  private async decrypt(value: Buffer): Promise<string> {
    return safeStorage.decryptString(Buffer.from(value));
  }
}

/**
 * Encode a string to be used as a cache key, returning a value with only alphanumeric, dash and underscore characters.
 */
function encodeCacheKey(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function isValidEndpointUrl(endpoint: string, issuer: URL): boolean {
  try {
    const endpointUrl = new URL(endpoint);
    return (
      endpointUrl.protocol === "https:" &&
      (!issuer.hostname.endsWith(".bentley.com") ||
        endpointUrl.origin === issuer.origin)
    );
  } catch {
    return false;
  }
}
