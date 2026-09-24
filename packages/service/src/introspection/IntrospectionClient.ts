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

/**
 * @alpha
 * @param issuerUrl The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined.
 * @param audience The audience this resource server expects. If defined, a
 * token is active only when its `aud` claim contains one of these values.
 */
export interface IntrospectionClientConfiguration {
  issuerUrl?: string;
  audience?: string | string[];
}

function removeAccessTokenPrefix(accessToken: string): string {
  const splitAccessToken = accessToken.split(" ");
  if (splitAccessToken.length !== 2)
    throw new BentleyError(BentleyStatus.ERROR, "Failed to decode JWT");
  return splitAccessToken[1];
}

const signingKeyCacheMaxAgeMs = 10 * 60 * 1000;

// Only asymmetric RSA algorithms can be verified with a JWKS public key.
// This list stops `none` and HMAC tokens from being accepted.
const allowedAlgorithms: jwt.Algorithm[] = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512"];

/** @alpha */
export class IntrospectionClient {
  private _discoveryClient: OIDCDiscoveryClient;

  public constructor(protected _config: IntrospectionClientConfiguration = {}) {
    this._discoveryClient = new OIDCDiscoveryClient(_config.issuerUrl);
    if (Array.isArray(_config.audience) && _config.audience.length === 0)
      throw new Error("IntrospectionClient audience must not be empty");
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
    // Rate limiting stops tokens with unknown `kid` values from flooding
    // the issuer with JWKS requests.
    this._jwks = jwks({
      jwksUri,
      cache: true,
      cacheMaxAge: signingKeyCacheMaxAgeMs,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
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
    const { issuer } = await this._discoveryClient.getConfig();
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
