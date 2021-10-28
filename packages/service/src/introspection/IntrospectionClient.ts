/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Introspection
 */

import { ClientMetadata, custom, Issuer, Client as OpenIdClient } from "openid-client";
import { IntrospectionResponse } from "./IntrospectionResponse";
import { MemoryIntrospectionResponseCache } from "./IntrospectionResponseCacheBase";
import { IntrospectionResponseCache } from "./IntrospectionResponseCache";
import { ServiceClientLoggerCategory } from "../ServiceClientLoggerCategory";
import { BentleyError, Logger } from "@itwin/core-bentley";

/**
 * @param _clientId
 * @param _clientSecret
 * @param _issuerUrl The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined.
 */
export interface IntrospectionClientConfiguration {
  readonly clientId: string;
  readonly clientSecret: string;
  issuerUrl?: string;
}

function removeAccessTokenPrefix(accessToken: string): string {
  return accessToken.substr(accessToken.indexOf(" ") + 1);
}

/** @alpha */
export class IntrospectionClient {
  private _client?: OpenIdClient;
  public url = "https://ims.bentley.com";

  public constructor(protected _config: IntrospectionClientConfiguration, protected _cache: IntrospectionResponseCache = new MemoryIntrospectionResponseCache()) {
    let prefix = process.env.IMJS_URL_PREFIX;
    const authority = new URL(this._config.issuerUrl ?? this.url);
    if (prefix && !this._config.issuerUrl){
      prefix = prefix === "dev-" ? "qa-" : prefix;
      authority.hostname = prefix + authority.hostname;
    }
    this.url = authority.href.replace(/\/$/, "");
  }

  private async getClient(): Promise<OpenIdClient> {
    if (this._client) {
      return this._client;
    }

    custom.setHttpOptionsDefaults({
      timeout: 10000,
      retry: 4,
    });

    const issuer = await this.getIssuer();

    const clientMetadata: ClientMetadata = {
      client_id: this._config.clientId, /* eslint-disable-line @typescript-eslint/naming-convention */
      client_secret: this._config.clientSecret, /* eslint-disable-line @typescript-eslint/naming-convention */
    };
    this._client = new issuer.Client(clientMetadata);
    return this._client;
  }

  private _issuer?: Issuer<OpenIdClient>;
  protected async getIssuer(): Promise<Issuer<OpenIdClient>> {
    if (this._issuer)
      return this._issuer;

    this._issuer = await Issuer.discover(this.url);
    return this._issuer;
  }

  public async introspect(accessToken: string): Promise<IntrospectionResponse> {
    const accessTokenStr = removeAccessTokenPrefix(accessToken) ?? "";

    try {
      const cachedResponse = await this._cache.get(accessTokenStr);
      if (!!cachedResponse) {
        return cachedResponse;
      }
    } catch (err) {
      Logger.logInfo(ServiceClientLoggerCategory.Introspection, `introspection response not found in cache: ${accessTokenStr}`, () => BentleyError.getErrorProps(err));
    }

    let client: OpenIdClient;
    try {
      client = await this.getClient();
    } catch (err) {
      Logger.logError(ServiceClientLoggerCategory.Introspection, `Unable to create oauth client`, () => BentleyError.getErrorProps(err));
      throw err;
    }

    let introspectionResponse: IntrospectionResponse;
    try {
      introspectionResponse = await client.introspect(accessTokenStr) as IntrospectionResponse;
    } catch (err) {
      Logger.logError(ServiceClientLoggerCategory.Introspection, `Unable to introspect client token`, () => BentleyError.getErrorProps(err));
      throw err;
    }

    this._cache.add(accessTokenStr, introspectionResponse); // eslint-disable-line @typescript-eslint/no-floating-promises

    return introspectionResponse;
  }
}
