# @itwin/node-cli-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/node-cli-authorization** package contains a Node.js command-line based client for authorization with the iTwin Platform by default and is configurable to work with any OAuth2.0 based provider.

## How it works

The node-cli-authorization client works by opening a system browser for users to supply credentials, then completes the flow by starting a local node server to facilitate the callback from the identity server.

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

## Refresh token storage

On Windows and macOS, this client caches the OAuth refresh token on disk (under `.configStore` by default, or `tokenStorePath` if supplied) so that users aren't prompted to sign in on every run. The cached token is encrypted at rest.

By default, encryption uses a random key that is generated on first use and persisted to a file alongside the token cache. This key is not derived from any public data (such as `clientId` or `issuerUrl`), so it can't be reconstructed by anyone without access to that key file.

**What this default does and doesn't protect against:** on macOS, the key file is created with owner-only permissions (`0600`) and is only trusted if it's still owned by the current user with no group/other access - the same bar `ssh` holds itself to for `~/.ssh/id_rsa`. This protects against a *different, unprivileged local user* on the same machine reading or tampering with the key. It does **not** protect against malware running as the same user, or against the key file and encrypted cache being copied together wholesale (e.g. full-disk or backup exfiltration) - in that scenario, whoever has the cache also has the key. **On Windows, this permission check is not yet implemented** - any regular file at the key path is currently trusted as-is (symlinks are still rejected), so the built-in default offers materially weaker protection there. If you need a real guarantee,  especially on Windows, or against a same-user attacker - use the `tokenEncryption` hook below with an OS-backed store instead of relying on this default.

Consumers that have access to a more secure, OS-backed encryption mechanism (e.g. Electron's [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) API, which is backed by DPAPI on Windows and Keychain on macOS) can supply their own `tokenEncryption` implementation instead of relying on the built-in key file:

```ts
const authClient = new NodeCliAuthorizationClient({
  clientId: "my-client-id",
  scope: "my-scope",
  tokenEncryption: {
    encrypt: async (plaintext) => safeStorage.encryptString(plaintext),
    decrypt: async (ciphertext) => safeStorage.decryptString(ciphertext),
  },
});
```

> **Note:** If a custom `tokenEncryption` is supplied, it must be used consistently for a given `tokenStorePath` across runs - switching between the built-in cipher and a custom implementation (or between different custom implementations) will cause previously cached tokens to become unreadable, requiring the user to sign in again.

Linux is currently unsupported for token caching; `signIn()` will always require interactive authorization on that platform.

## App setup

Choose "Desktop/Mobile" as your application type when [registering for use with this client](https://developer.bentley.com/register/).

Note that your registered application's redirectUri must start with `http://localhost:${redirectPort}`.

See the [AccessToken](https://www.itwinjs.org/learning/common/accesstoken/) article in the iTwin.js documentation for background on authorization in iTwin.js.

The OAuth2.0 workflow used in this package is Authorization Code + PKCE, for more information about the flow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizesinglepageapplicationsspaanddesktopmobileapplicationsnative).
