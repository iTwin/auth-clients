/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Introspection
 */

import { custom, Issuer, Client as OpenIdClient } from "openid-client";
import { IntrospectionResponse } from "./IntrospectionResponse";
import { MemoryIntrospectionResponseCache } from "./IntrospectionResponseCacheBase";
import { IntrospectionResponseCache } from "./IntrospectionResponseCache";
import { ServiceClientLoggerCategory } from "../ServiceClientLoggerCategory";
import { BentleyError, Logger } from "@itwin/core-bentley";
import * as jwks from "jwks-rsa";
import * as jwt from "jsonwebtoken";

/**
 * @param clientId
 * @param clientSecret
 * @param issuerUrl The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined.
 */
export interface IntrospectionClientConfiguration {
  issuerUrl?: string;
}

function removeAccessTokenPrefix(accessToken: string): string {
  return accessToken.substr(accessToken.indexOf(" ") + 1);
}

/** @alpha */
export class IntrospectionClient {
  public url = "https://ims.bentley.com";

  public constructor(protected _config: IntrospectionClientConfiguration = {}, protected _cache: IntrospectionResponseCache = new MemoryIntrospectionResponseCache()) {
    let prefix = process.env.IMJS_URL_PREFIX;
    const authority = new URL(this._config.issuerUrl ?? this.url);
    if (prefix && !this._config.issuerUrl) {
      prefix = prefix === "dev-" ? "qa-" : prefix;
      authority.hostname = prefix + authority.hostname;
    }
    this.url = authority.href.replace(/\/$/, "");
  }

  private _issuer?: Issuer<OpenIdClient>;
  protected async getIssuer(): Promise<Issuer<OpenIdClient>> {
    if (this._issuer)
      return this._issuer;

    custom.setHttpOptionsDefaults({
      timeout: 10000,
      retry: 4,
    });

    this._issuer = await Issuer.discover(this.url);
    return this._issuer;
  }

  private _jwks?: jwks.JwksClient;
  private getJwks(): jwks.JwksClient {
    if (this._jwks)
      return this._jwks;

    const jwksUri = this._issuer?.metadata.jwks_uri;
    if (!jwksUri) {
      Logger.logError(ServiceClientLoggerCategory.Introspection, "Issuer does not support JWKS");
      throw new Error("Issuer does not support JWKS");
    }
    this._jwks = jwks({ jwksUri });
    return this._jwks;
  }

  private _signingKeyCache = new Map<string, jwks.SigningKey>();
  private async getSigningKey(header: jwt.JwtHeader): Promise<jwks.SigningKey> {
    if (header.kid) { // if `kid` is undefined, always get a new signing key
      if (!this._signingKeyCache.has(header.kid))
        this._signingKeyCache.set(header.kid, await this.getJwks().getSigningKey(header.kid));
      return this._signingKeyCache.get(header.kid)!;
    }
    return this.getJwks().getSigningKey();
  }

  private async validateToken(accessToken: string): Promise<jwt.JwtPayload> {
    const header = jwt.decode(accessToken, { complete: true })?.header;
    if (!header)
      throw new Error("Failed to decode JWT");
    const key = await this.getSigningKey(header);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- false positive, real type is `string | Jwt`.
    return (await jwt.verify(accessToken, key.getPublicKey())) as jwt.JwtPayload;
  }

  public async introspect(accessToken: string): Promise<IntrospectionResponse> {
    const accessTokenStr = removeAccessTokenPrefix(accessToken) ?? "";

    try {
      const cachedResponse = await this._cache.get(accessTokenStr);
      if (!!cachedResponse) {
        return cachedResponse;
      }
    } catch (err) {
      Logger.logInfo(ServiceClientLoggerCategory.Introspection, `introspection response not found in cache:`, () => BentleyError.getErrorProps(err));
    }

    let introspectionResponse: IntrospectionResponse;
    try {
      const payload = await this.validateToken(accessTokenStr);
      if (!payload.scope)
        throw new Error("Missing scope in JWT");
      if (!Array.isArray(payload.scope) || payload.scope.length === 0 || typeof payload.scope[0] !== "string")
        throw new Error("Invalid scope");
      introspectionResponse = { ...payload, scope: payload.scope.join(" "), active: true };
    } catch (err) {
      Logger.logError(ServiceClientLoggerCategory.Introspection, `Unable to introspect client token`, () => BentleyError.getErrorProps(err));
      throw err;
    }

    this._cache.add(accessTokenStr, introspectionResponse); // eslint-disable-line @typescript-eslint/no-floating-promises

    return introspectionResponse;
  }
}
