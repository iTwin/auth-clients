# @itwin/electron-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The __@itwin/electron-authorization__ package contains an Electron based client for authorization with the iTwin Platform by default and is configurable to work with any OAuth2.0 based provider.

## How it works

The OAuth2.0 workflow used in this package is Authorization Code + PKCE, for more information about the flow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizesinglepageapplicationsspaanddesktopmobileapplicationsnative).

The package is broken into two main classes `ElectronMainAuthorization` and `ElectronRendererAuthorization` that communicate via Electron's IPC between the [main](https://www.electronjs.org/docs/latest/api/ipc-main) and [renderer](https://www.electronjs.org/docs/latest/api/ipc-renderer) process, respectively. The IPC channel is used to pass the login and access token information and handle refreshing the token when necessary.

## How to setup

An Electron application must follow a few setup steps in order to consume and use these classes correctly.

1. The Electron preload script (required for [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)) must create an implementation of `ITwinElectronApi` to allow the use of the `ipcRenderer` object provided by Electron. The implementation must be exposed in the window object so that the frontend has a means of accessing the Electron IPC. This is required because the frontend client does not naturally have access to the `ipcRenderer` object to interact with Electron IPC. An example of this can be seen in [ElectronPreload.ts](./src/renderer/ElectronPreload.ts).

    > Note: The `@itwin/core-electron` package handles this for any iTwin.js application working with an iModel so this step can be skipped if you're starting you app using `ElectronHost`.

2. `ElectronMainAuthorization` needs to setup listeners via the `ipcMain` object from Electron. The listeners should use the exact same channel names that the frontend uses. The listeners will response to requests to sign-in, sign-out, and retrieve the access token. When a token changes on the backend then it becomes necessary to send messages to the frontend unprovoked which cannot be done with the `ipcMain` object. Instead it must be done by accessing the window object's 'webContents' which has a `send` method that allows you to send data over a specific IPC channel name. An example of all this can be seen in [Client.ts](./src/main/Client.ts).

3. `ElectronRendererAuthorization`, for use in the renderer process, needs to be constructed and use a basic class that interacts with the `ITwinElectronApi` that is referenced from the window object. It should setup not only listeners to react when a token is changed on the backend but also methods that will invoke the backend when a sign-in or sign-out needs to happen. An example of this class (`ElectronAuthIPC`) and how the frontend uses it can be seen in [ElectronRenderer.ts](./src/frontend/FrontendClient.ts).

The list above is in the order that each of them need to be handled. The preload script is first as it is used on startup of an instance of Electron, the backend client is order of the above is important due to the order
