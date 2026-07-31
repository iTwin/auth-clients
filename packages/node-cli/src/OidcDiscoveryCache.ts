/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { AuthorizationServiceConfigurationJson } from "@openid/appauth";
import { AuthorizationServiceConfiguration } from "@openid/appauth";
import * as path from "node:path";
import * as NodePersist from "node-persist";

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
  private readonly _store: NodePersist.LocalStorage;
  private readonly _cacheKey: string;
  private _initialization?: Promise<unknown>;

  public constructor(issuer: string, dir?: string) {
    this._issuer = issuer;
    this._cacheKey = `oidcDiscovery_${encodeCacheKey(issuer)}`;
    const cacheDirectory = dir ?? path.join(process.cwd(), ".configStore");
    this._store = NodePersist.create({ dir: cacheDirectory });
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
    if (expiresAt) {
      await this.save({
        version: cacheVersion,
        issuer: this._issuer,
        expiresAt,
        configuration: configuration.toJson(),
      });
    }

    return configuration;
  }

  private async initialize(): Promise<void> {
    this._initialization ??= this._store.init();
    await this._initialization;
  }

  private async load(): Promise<
    AuthorizationServiceConfigurationJson | undefined
  > {
    try {
      await this.initialize();
      const cached = (await this._store.getItem(this._cacheKey)) as
        | CachedDiscoveryConfiguration
        | undefined;
      if (!cached) return undefined;

      if (
        cached.version !== cacheVersion ||
        isCachedExpired(cached.expiresAt)
      ) {
        await this._store.removeItem(this._cacheKey);
        return undefined;
      }

      this.validate({ issuer: cached.issuer, ...cached.configuration });
      return cached.configuration;
    } catch {
      try {
        await this._store.removeItem(this._cacheKey);
      } catch {
        // Discovery caching is an optimization; we continue on failure.
      }
      return undefined;
    }
  }

  private async save(cached: CachedDiscoveryConfiguration): Promise<void> {
    try {
      await this.initialize();
      await this._store.setItem(this._cacheKey, cached);
    } catch {
      // Discovery caching is an optimization; we continue on failure.
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
}

function encodeCacheKey(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function isCachedExpired(expiresAt: unknown): boolean {
  const maximumExpiration = Date.now() + maximumCacheAgeSeconds * 1000;
  return (
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    expiresAt > maximumExpiration
  );
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
