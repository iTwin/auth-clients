# @itwin/electron-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/electron-authorization** package contains an Electron based client for authorization with the iTwin Platform by default and is configurable to work with any OAuth2.0 based provider.

## How it works

The OAuth2.0 workflow used in this package is Authorization Code + PKCE, for more information about the flow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizesinglepageapplicationsspaanddesktopmobileapplicationsnative).

The package is broken into two main classes `ElectronMainAuthorization` and `ElectronRendererAuthorization` that communicate via Electron's IPC between the [main](https://www.electronjs.org/docs/latest/api/ipc-main) and [renderer](https://www.electronjs.org/docs/latest/api/ipc-renderer) process, respectively. The IPC channel is used to pass the login and access token information and handle refreshing the token when necessary.

## How to setup

An Electron application must follow a few setup steps in order to consume and use these classes correctly.

1. The Electron preload script (required for [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)) must create an implementation of `ITwinElectronApi` to allow the use of the `ipcRenderer` object provided by Electron. The implementation must be exposed in the window object so that the renderer process has a means of accessing the Electron IPC since it doesn't naturally have access to the `ipcRenderer`. An example of this can be seen in [ElectronPreload.ts](./src/renderer/ElectronPreload.ts).

   > Note: The `@itwin/core-electron` package handles this for any iTwin.js application working with an iModel so this step can be skipped if you're starting your app using `ElectronHost`.

2. `ElectronMainAuthorization` needs to setup listeners via the `ipcMain` object from Electron. The listeners should use the exact same channel names that the renderer process uses. The listeners will respond to requests to sign-in, sign-out, and retrieve the access token. When a token changes in the main process then it becomes necessary to send messages to the renderer process client unprovoked which cannot be done with the `ipcMain` object. Instead it must be done by accessing the window object's 'webContents' which has a `send` method that allows you to send data over a specific IPC channel name. An example of all this can be seen in the main [Client.ts](./src/main/Client.ts).

3. `ElectronRendererAuthorization`, for use in the renderer process, needs to be constructed needs to be created create and use a basic class that interacts with the `ITwinElectronApi` that is referenced from the window object. It should setup not only listeners to react when a token is changed in the main process client but also methods that will invoke the main process client when a sign-in or sign-out needs to happen. An example of this class (`ElectronAuthIPC`) and how the renderer process client uses it can be seen in the renderer [Client.ts](./src/renderer/Client.ts).

## Linux Usage

`ElectronMainAuthorization` uses the node package [Keytar](https://www.npmjs.com/package/keytar) to securely save refresh tokens to disk. This allows the client to automatically sign-in and receive a new access token between sessions. Keytar does this by using different native secure storage solutions depending on the operating system, and it uses libsecret on linux. In order to use keytar on linux, specifically Debian/Ubuntu, `libsecret-1-dev` must be installed.

If keytar is being used in a headless environment additional steps need to be taken. The following packages will need to be installed:

- `libsecret-1-dev`
- `dbus-x11`
- `gnome-keyring`

Users will then need to start a dbus session and create a keyring password by running `dbus-run-session -- sh` and then creating a keyring with `echo 'keyringPassword' | gnome-keyring-daemon -r -d --unlock`. Then simply start up the application like normal while in the dbus session: `npm run start`. If running within a Docker container, make sure to add the `--privileged` argument when running the container.
