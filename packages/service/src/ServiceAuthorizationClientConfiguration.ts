/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Authentication
 */
/**
* Configuration of clients for service or service applications.
* @see [[ServiceAuthorizationClient]] for notes on registering an application
* @beta
*/
export interface ServiceAuthorizationClientConfiguration {
  /** Client application's identifier as registered with the Bentley IMS OIDC/OAuth2 provider. */
  readonly clientId: string;
  /** Client application's secret key as registered with the Bentley IMS OIDC/OAuth2 provider. */
  readonly clientSecret: string;
  /** List of space separated scopes to request access to various resources. */
  readonly scope: string;
  /** The URL of the OIDC/OAuth2 provider. If left undefined, the iTwin Platform authority (`ims.bentley.com`) will be used by default. */
  readonly authority?: string;
  /**
   * Time in seconds that's used as a buffer to check the token for validity/expiry.
   * The checks for authorization, and refreshing access tokens all use this buffer - i.e., the token is considered expired if the current time is within the specified
   * time of the actual expiry.
   * @note If unspecified this defaults to 60 seconds
   */
  readonly expireSafety?: number;
}
