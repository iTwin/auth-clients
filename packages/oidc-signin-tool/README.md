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

## Mocha leaks

If you use this package with mocha, you may notice a global leak.

```js
Error: global leak(s) detected: '_playwrightInstance'
```

This is because as of 4.3.0, this package performs a late conditional import of Playwright to avoid
double-importing in some cases where the consumer may want to bring their own Playwright instance.
Double importing causes Playwright to throw an error. Playwright also leaks a global that mocha
used to ignore because it was created during the import phase. Now it is created during the late
conditional import where mocha doesn't expect it and it "leaks". **You should configure mocha to ignore
this leak.** In the future, the API requiring the dynamic import will be moved to a separate package
to avoid this situation.

You can ignore the leak like so:

```sh
mocha --check-leaks --global _playwrightInstance
```

or use `.mocharc`

```json
{
  "global": "_playwrightInstance"
}
```

