/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authorization
 */

import type { AuthorizationClient } from "@itwin/core-common";
import type { ServiceAuthorizationClientConfiguration } from "./ServiceAuthorizationClientConfiguration";
import type { Options as GotOptions } from "got" assert { "resolution-mode": "import" };
import { OIDCDiscoveryClient } from "./OIDCDiscoveryClient";

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
  private _discoveryClient: OIDCDiscoveryClient;
  private _gotOptions: Pick<GotOptions, "retry" | "timeout">;

  private _accessToken: string = "";
  private _expiresAt?: Date;

  constructor(serviceConfiguration: ServiceAuthorizationClientConfiguration) {
    this._gotOptions = {
      retry: {
        limit: 3,
        methods: ["GET", "POST"],
      },
      timeout: {
        lookup: 1000, // DNS
        connect: 1000, // socket connected
        send: 1000, // writing data to socket
        response: 10000, // starts when request has been flushed, ends when the headers are received.
        request: 12000, // global timeout
      },
    };

    this._discoveryClient = new OIDCDiscoveryClient(serviceConfiguration.authority);
    this._configuration = serviceConfiguration;
  }

  private async generateAccessToken(): Promise<string> {
    const scopes = this._configuration.scope.split(/\s+/);
    if (scopes.includes("openid") || scopes.includes("email") || scopes.includes("profile") || scopes.includes("organization"))
      throw new Error("Authorization error: Scopes for a service cannot include 'openid email profile organization'");

    const issuer = await this._discoveryClient.getConfig();
    if (!issuer.token_endpoint)
      throw new Error("Issuer does not support client credentials");

    const body = {
      grant_type: "client_credentials", // eslint-disable-line @typescript-eslint/naming-convention
      scope: scopes.join(" "),
    };

    const encoded = `${encodeURIComponent(this._configuration.clientId)}:${encodeURIComponent(this._configuration.clientSecret)}`.replace("%20", "+");
    const authHeader = `Basic ${Buffer.from(encoded).toString("base64")}`;

    const tokenSet = await (await import("got")).default.post(issuer.token_endpoint, {
      ...this._gotOptions,
      headers: {
        /* eslint-disable @typescript-eslint/naming-convention */
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": authHeader,
        /* eslint-enable @typescript-eslint/naming-convention */
      },
      form: body,
    }).json<any>();

    this._accessToken = `${tokenSet.token_type} ${tokenSet.access_token}`;
    if (tokenSet.expires_in)
      this._expiresAt = new Date(Date.now() + tokenSet.expires_in * 1000);
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
