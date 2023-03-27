# @itwin/oidc-signin-tool

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

A test utility that supports getting an access token using an interactive sign-in workflow. It is most useful for integration testing when a test user is required.

The tool automates the sign-in UI when given a user credentials for the iTwin Platform.

> Warning: This is not meant to be used in a production application. It is not a secure way to handle any sort of authentication for purposes other than testing.

## Usage

```typescript
const config = {
  clientId // string;
  redirectUri // string;
  scope // string;
  authority? // string;
  clientSecret? //  string;
}

const user {
  email // string;
  password // string;
}

const client = new TestBrowserAuthorizationClient(config, user);

const accessToken = await client.getAccessToken();

// other things you can do:

await client.signOut();

// same as client.getAccessToken, except the token is not returned
// the onAccessTokenChanged BeEvent is fired
await client.signIn()

// Getters

// Returns BeEvent
client.onAccessTokenChanged

client.isAuthorized
client.hasExpired

// same as client.isAuthorized, but user may be expired
client.hasSignedIn


```
