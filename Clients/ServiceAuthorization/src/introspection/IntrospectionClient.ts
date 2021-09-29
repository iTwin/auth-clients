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
import { BackendITwinClientLoggerCategory } from "../BackendITwinClientLoggerCategory";
import { AccessToken, getErrorProps, Logger } from "@bentley/bentleyjs-core";
import { removeAccessTokenPrefix } from "@bentley/itwin-client";

/**
 * @param _clientId
 * @param _clientSecret
 * @param _issuerUrl The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined.
 * @param _cache Optional means of caching previously introspected tokens. Defaults to an in-memory cache.
 */
export interface IntrospectionClientConfiguration {
  readonly clientId: string;
  readonly clientSecret: string;
  issuerUrl?: string;
  cache?: IntrospectionResponseCache;
}

/** @alpha */
export class IntrospectionClient {
  private _client?: OpenIdClient;

  public constructor(protected _config: IntrospectionClientConfiguration){
    if (_config.cache === undefined)
      _config.cache = new MemoryIntrospectionResponseCache();
  }

  private async getClient(): Promise<OpenIdClient> {
    if (this._client) {
      return this._client;
    }

    custom.setHttpOptionsDefaults({
      timeout: 10000,
      retry: 4,
    });

    const issuerUrl = this.getIssuerUrl();
    const issuer = await Issuer.discover(issuerUrl);

    const clientMetadata: ClientMetadata = {
      client_id: this._config.clientId, /* eslint-disable-line @typescript-eslint/naming-convention */
      client_secret: this._config.clientSecret, /* eslint-disable-line @typescript-eslint/naming-convention */
    };
    this._client = new issuer.Client(clientMetadata);
    return this._client;
  }

  protected getIssuerUrl(): string {
    return this._config.issuerUrl ?? "https://ims.bentley.com";
  }

  public async introspect(accessToken: AccessToken): Promise<IntrospectionResponse> {
    const accessTokenStr = removeAccessTokenPrefix(accessToken) ?? "";

    if (this._config.cache){
      try {
        const cachedResponse = await this._config.cache.get(accessTokenStr);
        if (!!cachedResponse) {
          return cachedResponse;
        }
      } catch (err) {
        Logger.logInfo(BackendITwinClientLoggerCategory.Introspection, `introspection response not found in cache: ${accessTokenStr}`, () => getErrorProps(err));
      }
    }

    let client: OpenIdClient;
    try {
      client = await this.getClient();
    } catch (err) {
      Logger.logError(BackendITwinClientLoggerCategory.Introspection, `Unable to create oauth client`, () => getErrorProps(err));
      throw err;
    }

    let introspectionResponse: IntrospectionResponse;
    try {
      introspectionResponse = await client.introspect(accessTokenStr) as IntrospectionResponse;
    } catch (err) {
      Logger.logError(BackendITwinClientLoggerCategory.Introspection, `Unable to introspect client token`, () => getErrorProps(err));
      throw err;
    }

    if (this._config.cache)
      this._config.cache.add(accessTokenStr, introspectionResponse); // eslint-disable-line @typescript-eslint/no-floating-promises

    return introspectionResponse;
  }
}
