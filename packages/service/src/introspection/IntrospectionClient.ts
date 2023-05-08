/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import type { IntrospectionResponse } from "./IntrospectionResponse";
import { ServiceClientLoggerCategory } from "../ServiceClientLoggerCategory";
import { BentleyError, BentleyStatus, Logger } from "@itwin/core-bentley";
import * as jwks from "jwks-rsa";
import * as jwt from "jsonwebtoken";
import { OIDCDiscoveryClient } from "@itwin/base-openid-client";

/**
 * @alpha
 * @param issuerUrl The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined.
 */
export interface IntrospectionClientConfiguration {
  issuerUrl?: string;
}

function removeAccessTokenPrefix(accessToken: string): string {
  const splitAccessToken = accessToken.split(" ");
  if (splitAccessToken.length !== 2)
    throw new BentleyError(BentleyStatus.ERROR, "Failed to decode JWT");
  return splitAccessToken[1];
}

/** @alpha */
export class IntrospectionClient {
  private _discoveryClient: OIDCDiscoveryClient;

  public constructor(protected _config: IntrospectionClientConfiguration = {}) {
    this._discoveryClient = new OIDCDiscoveryClient(_config.issuerUrl);
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
    this._jwks = jwks({ jwksUri });
    return this._jwks;
  }

  private _signingKeyCache = new Map<string, jwks.SigningKey>();
  private async getSigningKey(header: jwt.JwtHeader): Promise<jwks.SigningKey> {
    const jwksClient = await this.getJwks();
    if (header.kid) { // if `kid` is undefined, always get a new signing key
      if (!this._signingKeyCache.has(header.kid))
        this._signingKeyCache.set(header.kid, await jwksClient.getSigningKey(header.kid));
      return this._signingKeyCache.get(header.kid)!;
    }
    return jwksClient.getSigningKey();
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
    let active = true;
    try {
      // since we already called decode, we can ignore the result of verify and just check if it throws.
      jwt.verify(accessToken, key.getPublicKey());
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
