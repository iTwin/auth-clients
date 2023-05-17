# @itwin/browser-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/browser-authorization** package contains a browser based client for authorization with the iTwin platform.

## Usage

Create a new instance of `BrowserAuthorizationClient`, passing in needed credentials:

```typescript
const client = new BrowserAuthorizationClient({
  clientId: // find at developer.bentley.com
  redirectUri: // find/set at developer.bentley.com
  scope: // find/set at developer.bentley.com
  authority: // ims.bentley.com
  postSignoutRedirectUri: // find/set at developer.bentley.com
  responseType: "code",
  silentRedirectUri: // find/set at developer.bentley.com
});
```

The most common way to use an instance of `BrowserAuthorizationClient` will depend on your specific application and workflow. Here's one common way:

```typescript
// will attempt to sign in silently,
// and then via redirect if not possible.
await client.signInRedirect();
```

Instead of a redirect, you may want to trigger a pop up to handle the sign in process:

```typescript
await client.signinPopup();
```

After the user signs in, they will be redirected to the redirect url specified in your oidc configuration (developer.bentley.com)
Once on that page, you must call:

```typescript
await client.handleSigninCallback();
```

to complete the process. Once back on your initial page, the call to `client.signInSilent` will succeed and you should be authorized.

If the callback occurs on a page where the configured `client` is not available, you can use the static method to complete the process:

```typescript
await BrowserAuthorizationClient.handleSigninCallback();

// This library defaults to localStorage for storing state.
// To use sessionStorage (or another Storage object), you can pass it as an argument.
// If overriding the default localStorage, also set the stateStore via client.setAdvancedSettings({stateStore: yourStore})
await BrowserAuthorizationClient.handleSigninCallback(window.sessionStorage);
```

This will pull the client configuration from localStorage, using the state nonce provided by OIDC to select the proper configuration.

Other notable methods:
`client.signOutRedirect()` - starts the signout flow via redirect
`client.signOutPopup()` - starts the signout flow via popup.
`client.setAdvancedSettings(userManagerSettings)` - Allows for advanced options to be supplied to the underlying UserManager.

## Authorization Overview

For information about the browser authorization workflow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizingwebapplications).

## Running integration tests

- Ensure you've run `rush update` (or `rush install`) and `rush build`
- Install playwright binaries - `npx install playwright`
- Create an .env file based on .env.example - ask Arun G or Ben P for the values.
- `rush test:integration` will run integration tests for the entire repo.
- `rushx test:integration` runs the tests only in the Browser package.
- Playwright options are in playwright.config.ts (head-ful vs headless, timeouts, etc).
- The tests start the /test-app using parcel before running.
- To run only the test app: `rushx test:integration:start-test-app` and access localhost:1234 in your browser.
