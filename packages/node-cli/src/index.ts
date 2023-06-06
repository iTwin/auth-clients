/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
export * from "./Client";

/** @docs-package-description
 * Provides auth functionality for node command-line applications.
 *

## Usage:

The **@itwin/node-cli-authorization** package contains a Node.js command-line based client for authorization with the iTwin Platform by default and is configurable to work with any OAuth2.0 based provider.

```ts
const authClient = new NodeCliAuthorizationClient({
   // The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined.
  readonly issuerUrl?: string;

  // Upon signing in, the client application receives a response from the Bentley IMS OIDC/OAuth2 provider at this URI
  // For this client, must start with `http://localhost:${redirectPort}`
  // Defaults to "http://localhost:3000/signin-callback" if undefined.

  readonly redirectUri?: string;

  // Client application's identifier as registered with the OIDC/OAuth2 provider.
  readonly clientId: string;

  // List of space separated scopes to request access to various resources.
  readonly scope: string;

   // Time in seconds that's used as a buffer to check the token for validity/expiry.
   // The checks for authorization, and refreshing access tokens all use this buffer - i.e., the token is considered expired if the current time is within the specified
   // time of the actual expiry.
   // @note If unspecified this defaults to 10 minutes.

  readonly expiryBuffer ?: number;
});

// start the authorization processs:
await authClient.signIn();
*/

/**
 * @docs-group-description Authorization
 * Classes for signing a user in and out from the command line.
 */
