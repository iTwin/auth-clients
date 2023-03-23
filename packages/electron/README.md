# @itwin/electron-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/electron-authorization** package contains an Electron based client for authorization with the iTwin Platform by default and is configurable to work with any OAuth2.0 based provider.

## How it works

The OAuth2.0 workflow used in this package is Authorization Code + PKCE, for more information about the flow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizesinglepageapplicationsspaanddesktopmobileapplicationsnative).

The package is broken into two main classes `ElectronMainAuthorization` and `ElectronRendererAuthorization` that communicate via Electron's IPC between the [main](https://www.electronjs.org/docs/latest/api/ipc-main) and [renderer](https://www.electronjs.org/docs/latest/api/ipc-renderer) process, respectively. The IPC channel is used to pass the login and access token information and handle refreshing the token when necessary.

During initialization, this package will start an express.js loopback server. The port is 3000 by default and can be adjusted by setting the `redirectUrl` with url and port

## Usage

1. Setup Main Process (Skip if using @itwin/core-electron`)

- Add the `@itwin/browser-authorization/renderer/ElectronPreload` script as a preload to your renderer window.

```typescript
const win = new BrowserWindow({
  webPreferences: {
    preload: require.resolve(
      "@itwin/browser-authorization/renderer/ElectronPreload"
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

2. Setup Renderer Process

- Import the `ElectronRendererAuthorization` class and create a new instance
- Register a listener to the `ElectronRendererAuthorization.onAccessTokenChanged` which is a `BeEvent` and wait for a token.

```typescript
import { ElectronRendererAuthorization } from "@itwin/browser-authorization";

const client = new ElectronRendererAuthorization();

client.onAccessTokenChanged.addListener((token: string) => {
  console.log("Token received");
  console.log(token);
});

await client.signIn(); // sign in from the renderer process
```

> You probably only want to trigger an initial sign in from one of the processes; both are listed above for sake of completeness.

## Linux Compatibility

`ElectronMainAuthorization` uses the node package [Keytar](https://www.npmjs.com/package/keytar) to securely persist refresh tokens on disk. This allows the client to automatically sign-in and receive a new access token between sessions. In order to use keytar on linux, specifically Debian/Ubuntu, `libsecret-1-dev` must be installed.

If keytar is being used in a headless environment additional steps need to be taken. The following packages will need to be installed:

- `libsecret-1-dev`
- `dbus-x11`
- `gnome-keyring`

Users will then need to start a dbus session and create a keyring password by running `dbus-run-session -- sh` and then creating a keyring with `echo 'keyringPassword' | gnome-keyring-daemon -r -d --unlock`. Then simply start up the application like normal while in the dbus session: `npm run start`. If running within a Docker container, make sure to add the `--privileged` argument when running the container.

### API

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
