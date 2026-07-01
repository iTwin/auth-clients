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

## Bring your own Playwright

By default the tool dynamically imports its own copy of `@playwright/test` to
launch the headless browser that drives the sign-in UI. If your project already
depends on Playwright, loading two Playwright instances at once throws:

> Could not load @playwright/test. Do you have multiple playwright dependencies active? ...

To avoid this, build a Playwright `Page` with your own Playwright and pass it via
the `page` option. The tool then drives that page instead of importing its own
Playwright, so no second instance is loaded:

```typescript
import { chromium } from "@playwright/test";
import { getTestAccessToken, TestBrowserAuthorizationClient } from "@itwin/oidc-signin-tool";

const browser = await chromium.launch();
const page = await browser.newPage();

// convenience function
const accessToken = await getTestAccessToken(config, user, { page });

// or on the client
const client = new TestBrowserAuthorizationClient(config, user);
const token = await client.getAccessToken({ page });

// you own the lifecycle of the page and browser:
await browser.close();
```

The option is also available on `client.signIn()` and
`TestUtility.getAccessToken()`. When you supply a `page`, the tool does **not**
close your page or browser — you are responsible for cleaning them up. When the
option is omitted, the existing dynamic-import behavior is used, so this is fully
backwards compatible.

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

> Note: passing your own `page` (see [Bring your own Playwright](#bring-your-own-playwright))
> skips the dynamic import entirely, which also avoids this leak.

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

