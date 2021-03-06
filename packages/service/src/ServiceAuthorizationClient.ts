/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authentication
 */

import type { AuthorizationClient } from "@itwin/core-common";
import type { ClientMetadata, GrantBody, Client as OpenIdClient, TokenSet } from "openid-client";
import { custom, Issuer } from "openid-client";
import type { ServiceAuthorizationClientConfiguration } from "./ServiceAuthorizationClientConfiguration";

/**
  * Utility to generate OIDC/OAuth tokens for service or service applications
  * * The application must register a client using the
  * [self service registration page](https://developer.bentley.com/register/).
  * * The client type must be "service"
  * * Use the Client Id/Client Secret/Scopes to create the service configuration that's passed in.
  * * Ensure the application can access the iTwin Project/Asset - in production environments, this is done by
  * using the iTwin project portal to add add the email **`{Client Id}@apps.imsoidc.bentley.com`** as an authorized user
  * with the appropriate role that includes the required access permissions.
  * @beta
  */
export class ServiceAuthorizationClient implements AuthorizationClient {
  protected _configuration: ServiceAuthorizationClientConfiguration;

  private _accessToken: string = "";
  private _expiresAt?: Date;

  public url = "https://ims.bentley.com";

  private _client?: OpenIdClient;

  constructor(serviceConfiguration: ServiceAuthorizationClientConfiguration) {
    custom.setHttpOptionsDefaults({
      timeout: 10000,
      retry: 4,
    });

    this._configuration = serviceConfiguration;

    let prefix = process.env.IMJS_URL_PREFIX;
    const authority = new URL(this._configuration.authority ?? this.url);
    if (prefix && !this._configuration.authority){
      prefix = prefix === "dev-" ? "qa-" : prefix;
      authority.hostname = prefix + authority.hostname;
    }
    this.url = authority.href.replace(/\/$/, "");
  }

  private _issuer?: Issuer<OpenIdClient>;
  private async getIssuer(): Promise<Issuer<OpenIdClient>> {
    if (this._issuer)
      return this._issuer;

    this._issuer = await Issuer.discover(this.url);
    return this._issuer;
  }

  /**
  * Discover the endpoints of the service
  */
  public async discoverEndpoints(): Promise<Issuer<OpenIdClient>> {
    return this.getIssuer();
  }

  protected async getClient(): Promise<OpenIdClient> {
    if (this._client)
      return this._client;

    const clientConfiguration: ClientMetadata = {
      client_id: this._configuration.clientId, // eslint-disable-line @typescript-eslint/naming-convention
      client_secret: this._configuration.clientSecret, // eslint-disable-line @typescript-eslint/naming-convention
    };

    const issuer = await this.getIssuer();
    this._client = new issuer.Client(clientConfiguration);

    return this._client;
  }

  private async generateAccessToken(): Promise<string> {
    const scope = this._configuration.scope;
    if (scope.includes("openid") || scope.includes("email") || scope.includes("profile") || scope.includes("organization"))
      throw new Error("Authorization error: Scopes for an service cannot include 'openid email profile organization'");

    const grantParams: GrantBody = {
      grant_type: "client_credentials", // eslint-disable-line @typescript-eslint/naming-convention
      scope,
    };

    let tokenSet: TokenSet;
    const client = await this.getClient();
    try {
      tokenSet = await client.grant(grantParams);
    } catch (error: any) {
      throw new Error(`Authorization error: ${error.message}`);
    }

    this._accessToken = `Bearer ${tokenSet.access_token}`;
    if (tokenSet.expires_at)
      this._expiresAt = new Date(tokenSet.expires_at * 1000);
    return this._accessToken;
  }

  /**
  * Set to true if there's a current authorized user or client (in the case of service applications).
  * Set to true if signed in and the access token has not expired, and false otherwise.
  */
  public get isAuthorized(): boolean {
    return this.hasSignedIn && !this.hasExpired;
  }

  /** Set to true if the user has signed in, but the token has expired and requires a refresh */
  public get hasExpired(): boolean {
    if (!this._accessToken)
      return false;

    if (!this._expiresAt)
      throw new Error("Authorization error: Invalid JWT");

    return this._expiresAt.getTime() - Date.now() <= 1 * 60 * 1000; // Consider 1 minute before expiry as expired
  }

  /** Set to true if signed in - the accessToken may be active or may have expired and require a refresh */
  public get hasSignedIn(): boolean {
    return !!this._accessToken;
  }

  /** Returns a promise that resolves to the AccessToken of the currently authorized client.
  * The token is refreshed if necessary.
  */
  public async getAccessToken(): Promise<string> {
    if (this.isAuthorized)
      return this._accessToken;
    return this.generateAccessToken();
  }
}
