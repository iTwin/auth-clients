/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Logger } from "@itwin/core-bentley";
import type { AuthorizationServiceConfigurationJson } from "@openid/appauth";
import { AuthorizationServiceConfiguration } from "@openid/appauth";
import { safeStorage } from "electron";
import { electronAuthLoggerCategory } from "../common/constants.js";
const Store = require("electron-store"); // eslint-disable-line @typescript-eslint/no-require-imports, @typescript-eslint/naming-convention

// NOTE: this logic is almost identical to the logic in the node-cli OidcDiscoveryCache.
// A future refactor could extract this logic into a shared class.

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
    this._issuer = normalizeIssuerUrl(issuer);
    this._cacheKey = encodeCacheKey(this._issuer);
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
    const expiresAt = getExpiration(response.headers);
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
      if (cached.version !== cacheVersion) {
        this._store.delete(this._cacheKey);
        return undefined;
      }
      if (isCachedExpired(cached.expiresAt)) {
        Logger.logTrace(
          electronAuthLoggerCategory,
          "Cached OIDC configuration expired",
          () => ({ issuer: this._issuer, expiresAt: cached.expiresAt }),
        );
        this._store.delete(this._cacheKey);
        return undefined;
      }

      this.validate({ issuer: cached.issuer, ...cached.configuration });
      Logger.logTrace(
        electronAuthLoggerCategory,
        "Using cached OIDC configuration",
        () => ({ issuer: this._issuer, expiresAt: cached.expiresAt }),
      );
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

  private validate(document: DiscoveryDocument): void {
    if (
      typeof document.issuer !== "string" ||
      normalizeIssuerUrl(document.issuer) !== this._issuer
    )
      throw new Error(
        "OIDC discovery response issuer does not match the configured issuer",
      );

    const requiredEndpoints = [
      ["authorization_endpoint", document.authorization_endpoint],
      ["token_endpoint", document.token_endpoint],
    ] as const;
    const optionalEndpoints = [
      ["revocation_endpoint", document.revocation_endpoint],
      ["end_session_endpoint", document.end_session_endpoint],
      ["userinfo_endpoint", document.userinfo_endpoint],
    ] as const;

    const issuer = new URL(this._issuer);
    if (issuer.protocol !== "https:")
      throw new Error("OIDC issuer must use HTTPS");

    validateEndpoints(requiredEndpoints, issuer, false);
    validateEndpoints(optionalEndpoints, issuer, true);
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

function normalizeIssuerUrl(value: string): string {
  return new URL(value).href.replace(/\/$/, "");
}

function getExpiration(headers: Headers): number | undefined {
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
  const ageHeader = headers.get("age");
  const age =
    ageHeader && /^\d+$/.test(ageHeader.trim())
      ? Number.parseInt(ageHeader, 10)
      : 0;
  const remainingMaxAge = maxAge - age;
  return remainingMaxAge > 0
    ? Date.now() + remainingMaxAge * 1000
    : undefined;
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

function validateEndpoints(
  endpoints: ReadonlyArray<readonly [string, unknown]>,
  issuer: URL,
  optional: boolean,
): void {
  for (const [name, endpoint] of endpoints) {
    if (endpoint === undefined && optional) continue;

    if (typeof endpoint !== "string" || endpoint.length === 0)
      throw new Error(`OIDC discovery response is missing ${name}`);

    if (!isValidEndpointUrl(endpoint, issuer))
      throw new Error(
        `OIDC endpoints must use HTTPS and Bentley endpoints must use the configured issuer origin: issuer=${issuer}, endpoint=${endpoint}`,
      );
  }
}
