/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
export * from "./Client";
export * from "./LoggerCategory";
export * from "./types";

/** @docs-package-description
 * Provides auth functionality for browser environments using OIDC code flow with PKCE.
 *
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
await BrowserAuthorizationClient.handleSigninCallback()

// This library defaults to localStorage for storing state.
// To use sessionStorage (or another Storage object), you can pass it as an argument.
// If overriding the default localStorage, also set the stateStore via client.setAdvancedSettings({stateStore: yourStore})
await BrowserAuthorizationClient.handleSigninCallback(window.sessionStorage)
```

This will pull the client configuration from localStorage, using the state nonce provided by OIDC to select the proper configuration.

Other notable methods:
`client.signOutRedirect()` - starts the signout flow via redirect
`client.signOutPopup()` - starts the signout flow via popup.
`client.setAdvancedSettings(userManagerSettings)` - Allows for advanced options to be supplied to the underlying UserManager.

 */

/**
 * @docs-group-description Authorization
 * For signing a user in and out of an auth service.
 */

/**
 * @docs-group-description Logging
 * Logger categories used by this package.
 */
