# @itwin/node-cli-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/node-cli-authorization** package contains a Node.js command-line based client for authorization with the iTwin Platform by default and is configurable to work with any OAuth2.0 based provider.

## How it works

The node-cli-authorization client works by opening a system browser for users to supply credentials, then completes the auth flow by starting a node server to complete the callback.

```ts
const authClient = new NodeCliAuthorizationClient({
  /** The OAuth token issuer URL. Defaults to Bentley's auth URL if undefined. */
  readonly issuerUrl?: string;
  /**
   * Upon signing in, the client application receives a response from the Bentley IMS OIDC/OAuth2 provider at this URI
   * For this client, must start with `http://localhost:${redirectPort}`
   * Defaults to "http://localhost:3000/signin-callback" if undefined.
   */
  readonly redirectUri?: string;
  /** Client application's identifier as registered with the OIDC/OAuth2 provider. */
  readonly clientId: string;
  /** List of space separated scopes to request access to various resources. */
  readonly scope: string;
  /**
   * Time in seconds that's used as a buffer to check the token for validity/expiry.
   * The checks for authorization, and refreshing access tokens all use this buffer - i.e., the token is considered expired if the current time is within the specified
   * time of the actual expiry.
   * @note If unspecified this defaults to 10 minutes.
   */
  readonly expiryBuffer?: number;
});

await authClient.signIn();
```

## App setup

Choose "Desktop/Mobile" as your application type when [registering for use with this client](https://developer.bentley.com/register/).

Note that your registered application's redirectUri must start with `http://localhost:${redirectPort}`.

See the [AccessToken](https://www.itwinjs.org/learning/common/accesstoken/) article in the iTwin.js documentation for background on authorization in iTwin.js.

The OAuth2.0 workflow used in this package is Authorization Code + PKCE, for more information about the flow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizesinglepageapplicationsspaanddesktopmobileapplicationsnative).
