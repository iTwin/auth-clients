# @itwin/electron-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/electron-authorization** package contains an Electron based client for authorization with the iTwin Platform by default and is configurable to work with any OAuth2.0 based provider.

## How it works

The OAuth2.0 workflow used in this package is Authorization Code + PKCE, for more information about the flow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizesinglepageapplicationsspaanddesktopmobileapplicationsnative).

The package is broken into two main classes `ElectronMainAuthorization` and `ElectronRendererAuthorization` that communicate via Electron's IPC between the [main](https://www.electronjs.org/docs/latest/api/ipc-main) and [renderer](https://www.electronjs.org/docs/latest/api/ipc-renderer) process, respectively. The IPC channel is used to pass the login and access token information and handle refreshing the token when necessary.

During initialization, this package will start an express.js loopback server. The port is 3000 by default and can be adjusted by setting the `_redirectUris` with url and port

## Usage

1. Setup Main Process (Skip if using @itwin/core-electron`)

- Add the `@itwin/electron-authorization/renderer/ElectronPreload` script as a preload to your renderer window.

```typescript
const win = new BrowserWindow({
  webPreferences: {
    preload: require.resolve(
      "@itwin/electron-authorization/renderer/ElectronPreload"
    ),
  },
});
```

- When your browser window is ready, create a new client.

```typescript
const client = new ElectronMainAuthorization({
  clientId: process.env.clientId,
  scope: process.env.scope,
});

await client.signIn(); // sign in from the main process
```

<blockquote> If your app has its own directory to store config files, you can override the default path the refresh token is stored by specifying an optional field in the constructor object, like so:

```typescript
new ElectronMainAuthorization({
  ...
  tokenStorePath: yourOwnDirectoryAbsolutePath
})
```

</blockquote>
2. Setup Renderer Process

- Import the `ElectronRendererAuthorization` class and create a new instance
- Register a listener to the `ElectronRendererAuthorization.onAccessTokenChanged` which is a `BeEvent` and wait for a token.

```typescript
import { ElectronRendererAuthorization } from "@itwin/electron-authorization/Renderer";

const client = new ElectronRendererAuthorization();

client.onAccessTokenChanged.addListener((token: string) => {
  console.log("Token received");
  console.log(token);
});

await client.signIn(); // sign in from the renderer process
```

> You probably only want to trigger an initial sign in from one of the processes; both are listed above for sake of completeness.

> **Note**: If you're using `moduleResolution: node16/nodenext`, you can import using the pattern above.
>
> If not, you can import it like this instead: `import { ElectronRendererAuthorization } from "@itwin/electron-authorization/lib/esm/ElectronRenderer";`

## Linux Compatibility

`ElectronMainAuthorization` uses Electron's [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) to securely encrypt and decrypt refresh tokens on disk. This allows the client to automatically sign-in and receive a new access token between sessions. In order to use safeStorage on linux, specifically Debian/Ubuntu, `libsecret-1-dev` must be installed.

If keytar is being used in a headless environment additional steps need to be taken. The following packages will need to be installed:

- `libsecret-1-dev`
- `dbus-x11`
- `gnome-keyring`

Users will then need to start a dbus session and create a keyring password by running `dbus-run-session -- sh` and then creating a keyring with `echo 'keyringPassword' | gnome-keyring-daemon -r -d --unlock`. Then simply start up the application like normal while in the dbus session: `npm run start`. If running within a Docker container, make sure to add the `--privileged` argument when running the container.

## API

`ElectronMainAuthorization`

| Method               | Description                                                  | Type       | Returns                |
| -------------------- | ------------------------------------------------------------ | ---------- | ---------------------- |
| `signIn`             | Starts the sign in flow                                      | `Function` | `Promise<void>`        |
| `silentSignIn`       | Attempts a silent sign in with the authorization provider    | `Function` | `Promise<void>`        |
| `signOut`            | Signs a user out                                             | `Function` | `Promise<void>`        |
| `onUserStateChanged` | Fired when a user's token changes                            | `BeEvent`  | `void`                 |
| `refreshToken`       | Forces a refresh of the user's access token                  | `Function` | `Promise<AccessToken>` |
| `getAccessToken`     | returns a token if available, otherwise calls `refreshToken` | `Function` | `Promise<AccessToken>` |
| `tokenStore`         | returns the `ElectronTokenStore`                             | `getter`   | `ElectronTokenStore`   |

`ElectronBrowserAuthorization`

| Method                 | Description                                                  | Type       | Returns                |
| ---------------------- | ------------------------------------------------------------ | ---------- | ---------------------- |
| `signIn`               | Starts the sign in flow from the renderer                    | `Function` | `Promise<void>`        |
| `signOut`              | Signs a user out                                             | `Function` | `Promise<void>`        |
| `onAccessTokenChanged` | Fired when a user's token changes                            | `BeEvent`  | `void`                 |
| `getAccessToken`       | returns a token if available, otherwise calls `refreshToken` | `Function` | `Promise<AccessToken>` |
| `hasSignedIn`          | Whether or not the user has _ever_ signed in                 | `getter`   | `boolean`              |
| `isAuthorized`         | Whether the user is signed in and not expired                | `getter`   | `boolean`              |

### `new ElectronMainAuthorization(options)` - options

| Property                | Type                               | Description                                                                                                                              |
| ----------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `issuerUrl`             | `string` (optional)                | The OAuth token issuer URL. Defaults to Bentley's auth production URL if undefined.                                                      |
| `redirectUris`          | `string[]`                         | List of redirect URIs available for use in the OAuth authorization flow. See note below:                                                 |
| `clientId`              | `string`                           | Client application's identifier as registered with the OIDC/OAuth2 provider.                                                             |
| `scopes`                | `string`                           | List of space separated scopes to request access to various resources.                                                                   |
| `expiryBuffer`          | `number` (optional)                | Time in seconds that's used as a buffer to check the token for validity/expiry.                                                          |
| `ipcSocket`             | `IpcSocketBackend` (optional)      | Optional custom implementation of `IpcSocketBackend` to use for IPC communication with the Frontend counterpart of authorization client. |
| `authenticationOptions` | `AuthenticationOptions` (optional) | Additional options to use for every OIDC authentication request made by `ElectronMainAuthorization`.                                     |
| `tokenStorePath`        | `string` (optional)                | Directory path that overrides where the refresh token is stored.                                                                         |

### RedirectUris

The `redirectUris` property is an array of strings that represent the URIs that the authorization server can redirect to after the user has authenticated. The URIs must be in the format `http(s)://localhost:port` where `port` is the port number that the ElectronMainAuthorization instance will listen on. The default port is 3000.

- In the case of a port collision, it is recommended to use multiple (e.g. three) redirect URIs with different ports.
- A decent strategy for choosing ports for your application is: `3|4|5{GPR_ID}`. For example (GPR_ID used here is 1234):
- `http://localhost:31234/signin-callback`
- `http://localhost:41234/signin-callback`
- `http://localhost:51234/signin-callback`
