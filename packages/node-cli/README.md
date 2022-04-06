# @itwin/node-cli-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The __@itwin/node-cli-authorization__ package contains a Node.js command-line based client for authorization with the iTwin Platform by default and is configurable to work with any OAuth2.0 based provider.

## How it works

The OAuth2.0 workflow used in this package is Authorization Code + PKCE, for more information about the flow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizesinglepageapplicationsspaanddesktopmobileapplicationsnative).

## How to setup

See the [AccessToken](https://www.itwinjs.org/learning/common/accesstoken/) article in the iTwin.js documentation for background on authorization in iTwin.js.

Note that your registered application's redirectUri must start with `http://localhost:${redirectPort}` or `https://localhost:${redirectPort}`.

```ts
const authClient = new NodeCliAuthorizationClient(yourConfig);
await authClient.signIn();
IModelHost.authorizationClient = authClient;
```
