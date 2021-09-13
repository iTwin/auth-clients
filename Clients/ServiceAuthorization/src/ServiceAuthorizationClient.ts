/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authentication
 */

import { AuthStatus, BentleyError, ClientRequestContext, Logger } from "@bentley/bentleyjs-core";
import { RequestGlobalOptions } from "@bentley/itwin-client";
import { AccessToken, AuthorizationClient } from "authorization-base";
import { ClientMetadata, custom, GrantBody, Issuer, Client as OpenIdClient, TokenSet } from "openid-client";
import { BackendITwinClientLoggerCategory } from "./BackendITwinClientLoggerCategory";

const loggerCategory = BackendITwinClientLoggerCategory.Authorization;

/**
* Configuration of clients for service or service applications.
* @see [[ServiceAuthorizationClient]] for notes on registering an application
* @beta
*/
export interface ServiceAuthorizationClientConfiguration {
  /** Client application's identifier as registered with the Bentley IMS OIDC/OAuth2 provider. */
  clientId: string;
  /** Client application's secret key as registered with the Bentley IMS OIDC/OAuth2 provider. */
  clientSecret: string;
  /** List of space separated scopes to request access to various resources. */
  scope: string;
}
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
  protected searchKey: string = "IMSOpenId";

  protected _configuration: ServiceAuthorizationClientConfiguration;
  protected _url?: string;

  private _accessToken?: AccessToken;
  private _expiresAt?: Date;

  constructor(serviceConfiguration: ServiceAuthorizationClientConfiguration) {
    this._url = process.env.IMJS_ITWIN_PLATFORM_AUTHORITY;

    custom.setHttpOptionsDefaults({
      timeout: RequestGlobalOptions.timeout.response,
      retry: RequestGlobalOptions.maxRetries,
      agent: {
        https: RequestGlobalOptions.httpsProxy,
      },
    });

    this._configuration = serviceConfiguration;
  }

  private _issuer?: Issuer<OpenIdClient>;
  private async getIssuer(requestContext: ClientRequestContext): Promise<Issuer<OpenIdClient>> {
    requestContext.enter();

    if (this._issuer)
      return this._issuer;

    const url = this.getUrl();
    this._issuer = await Issuer.discover(url);
    return this._issuer;
  }

  /**
   * Gets the URL of the service.
   * @returns URL for the service
   */
  public getUrl(): string {
    return this._url ?? "";
  }

  /**
  * Discover the endpoints of the service
  */
  public async discoverEndpoints(requestContext: ClientRequestContext): Promise<Issuer<OpenIdClient>> {
    requestContext.enter();
    return this.getIssuer(requestContext);
  }

  private _client?: OpenIdClient;
  protected async getClient(requestContext: ClientRequestContext): Promise<OpenIdClient> {
    requestContext.enter();

    if (this._client)
      return this._client;

    const clientConfiguration: ClientMetadata = {
      client_id: this._configuration.clientId, // eslint-disable-line @typescript-eslint/naming-convention
      client_secret: this._configuration.clientSecret, // eslint-disable-line @typescript-eslint/naming-convention
    };

    const issuer = await this.getIssuer(requestContext);
    this._client = new issuer.Client(clientConfiguration);

    return this._client;
  }

  private async generateAccessToken(requestContext: ClientRequestContext): Promise<AccessToken | undefined> {
    const scope = this._configuration.scope;
    if (scope.includes("openid") || scope.includes("email") || scope.includes("profile") || scope.includes("organization"))
      throw new BentleyError(AuthStatus.Error, "Scopes for an service cannot include 'openid email profile organization'");

    const grantParams: GrantBody = {
      grant_type: "client_credentials", // eslint-disable-line @typescript-eslint/naming-convention
      scope,
    };

    let tokenSet: TokenSet;
    const client = await this.getClient(requestContext);
    try {
      tokenSet = await client.grant(grantParams);
    } catch (error) {
      throw new BentleyError(AuthStatus.Error, error.message || "Authorization error", Logger.logError, loggerCategory, () => ({ error: error.error, message: error.message }));
    }

    this._accessToken = tokenSet.access_token;
    if (tokenSet.expires_at)
      this._expiresAt = new Date(tokenSet.expires_at); // TODO: Check if this is in proper format
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
      throw new BentleyError(AuthStatus.Error, "Invalid JWT");

    return this._expiresAt.getTime() - Date.now() <= 1 * 60 * 1000; // Consider 1 minute before expiry as expired
  }

  /** Set to true if signed in - the accessToken may be active or may have expired and require a refresh */
  public get hasSignedIn(): boolean {
    return !!this._accessToken;
  }

  /** Returns a promise that resolves to the AccessToken of the currently authorized client.
  * The token is refreshed if necessary.
  */
  public async getAccessToken(requestContext?: ClientRequestContext): Promise<AccessToken | undefined> {
    if (this.isAuthorized)
      return this._accessToken;
    return this.generateAccessToken(requestContext || new ClientRequestContext());
  }
}
