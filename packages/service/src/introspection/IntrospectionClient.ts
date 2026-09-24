/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import type { IntrospectionResponse } from "./IntrospectionResponse";
import { ServiceClientLoggerCategory } from "../ServiceClientLoggerCategory";
import { BentleyError, BentleyStatus, Logger } from "@itwin/core-bentley";
import * as jwks from "jwks-rsa";
import * as jwt from "jsonwebtoken";
import { OIDCDiscoveryClient } from "../OIDCDiscoveryClient";

/** @alpha */
export interface IntrospectionClientConfiguration {
  /** The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined. */
  issuerUrl?: string;
  /**
   * The `iss` values to accept. Each value must match the claim exactly.
   * If undefined, the client accepts the issuer from the OIDC discovery
   * document. For Bentley IMS, it also accepts the matching `ims` or
   * `imsoidc` host, because both hosts sign tokens with the same keys.
   */
  issuer?: string | string[];
  /**
   * The audience this resource server expects. If defined, a token is
   * active only when its `aud` claim contains one of these values.
   */
  audience?: string | string[];
}

function assertNotEmpty(name: string, value: string | string[] | undefined): void {
  if (value === undefined)
    return;

  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0 || values.some((entry) => typeof entry !== "string" || entry === ""))
    throw new Error(`IntrospectionClient ${name} must not be empty`);
}

// IMS publishes the same signing keys at `{prefix}ims.bentley.com` and
// `{prefix}imsoidc.bentley.com`, but each host has its own issuer. A token
// from either host is signed by IMS, so the default accepts both.
const imsIssuerPattern = /^https:\/\/([a-z0-9]+-)?ims(oidc)?\.bentley\.com$/;

function getImsTwinIssuer(issuer: string): string | undefined {
  const match = imsIssuerPattern.exec(issuer);
  if (!match)
    return undefined;

  const [, prefix = "", oidc] = match;
  return `https://${prefix}${oidc ? "ims" : "imsoidc"}.bentley.com`;
}

function removeAccessTokenPrefix(accessToken: string): string {
  const splitAccessToken = accessToken.split(" ");
  if (splitAccessToken.length !== 2)
    throw new BentleyError(BentleyStatus.ERROR, "Failed to decode JWT");
  return splitAccessToken[1];
}

const signingKeyCacheMaxAgeMs = 10 * 60 * 1000; // 10 Min

// IMS signs access tokens with RSA keys. Allow only RSA algorithms, so
// that `none`, HMAC, and other key types are rejected.
const allowedAlgorithms: jwt.Algorithm[] = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512"];

/** @alpha */
export class IntrospectionClient {
  private _discoveryClient: OIDCDiscoveryClient;

  public constructor(protected _config: IntrospectionClientConfiguration = {}) {
    assertNotEmpty("issuer", _config.issuer);
    assertNotEmpty("audience", _config.audience);
    this._discoveryClient = new OIDCDiscoveryClient(_config.issuerUrl);
  }

  private async getAcceptedIssuers(): Promise<string | string[]> {
    if (this._config.issuer !== undefined)
      return this._config.issuer;

    // jsonwebtoken skips the issuer check for an empty value, so fail closed.
    const { issuer } = await this._discoveryClient.getConfig();
    if (!issuer)
      throw new Error("Issuer is missing from the OIDC discovery document");

    const twinIssuer = getImsTwinIssuer(issuer);
    return twinIssuer ? [issuer, twinIssuer] : issuer;
  }

  private _jwks?: jwks.JwksClient;
  private async getJwks(): Promise<jwks.JwksClient> {
    if (this._jwks)
      return this._jwks;

    const jwksUri = (await this._discoveryClient.getConfig()).jwks_uri;
    if (!jwksUri) {
      Logger.logError(ServiceClientLoggerCategory.Introspection, "Issuer does not support JWKS");
      throw new Error("Issuer does not support JWKS");
    }
    // Keys are cached for a bounded time only, so a key the issuer removes
    // from its JWKS stops being trusted once its cache entry expires.
    // Do not enable `rateLimit`: jwks-rsa does not cache failed lookups, so
    // tokens with unknown `kid` values would use up the limit and block the
    // refresh of real keys when their cache entries expire.
    this._jwks = jwks({
      jwksUri,
      cache: true,
      cacheMaxAge: signingKeyCacheMaxAgeMs,
    });
    return this._jwks;
  }

  private async getSigningKey(header: jwt.JwtHeader): Promise<jwks.SigningKey> {
    const jwksClient = await this.getJwks();
    return jwksClient.getSigningKey(header.kid);
  }

  private async validateToken(accessToken: string): Promise<IntrospectionResponse> {
    const decoded = jwt.decode(accessToken, { complete: true, json: true });
    if (!decoded)
      throw new Error("Failed to decode JWT");
    const { payload, header } = decoded as { payload: jwt.JwtPayload, header: jwt.JwtHeader };

    if (!payload || !payload.scope)
      throw new Error("Missing scope in JWT");
    if (!Array.isArray(payload.scope) || payload.scope.length === 0 || typeof payload.scope[0] !== "string")
      throw new Error("Invalid scope");

    const key = await this.getSigningKey(header);
    const issuer = await this.getAcceptedIssuers();
    let active = true;
    try {
      // since we already called decode, we can ignore the result of verify and just check if it throws.
      jwt.verify(accessToken, key.getPublicKey(), {
        algorithms: allowedAlgorithms,
        issuer,
        audience: this._config.audience,
      });
    } catch (err) {
      Logger.logInfo(ServiceClientLoggerCategory.Introspection, "Client token marked inactive", () => BentleyError.getErrorProps(err));
      active = false;
    }

    return { ...payload, active, scope: payload.scope.join(" ") };
  }

  public async introspect(accessToken: string): Promise<IntrospectionResponse> {
    const accessTokenStr = removeAccessTokenPrefix(accessToken);

    try {
      return await this.validateToken(accessTokenStr);
    } catch (err) {
      Logger.logError(ServiceClientLoggerCategory.Introspection, "Unable to introspect client token", () => BentleyError.getErrorProps(err));
      throw err;
    }
  }
}
