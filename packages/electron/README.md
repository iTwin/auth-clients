# @itwin/electron-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The __@itwin/electron-authorization__ package contains an electron based client for authorization with the iTwin platform.

## Documentation

For information about the electron authorization workflow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizesinglepageapplicationsspaanddesktopmobileapplicationsnative).

**IPC Setup**

The electron frontend and backend auth clients communicate via electron's IPC channels in order to exchange login and access token information. The channels must be setup correctly for it to work. There are 3 general steps to set this up:

1. The electron preload script must create an implementation of `ITwinElectronApi` which allows the creation of IPC channels by using the `ipcRenderer` object provided by electron. This implementation must then be exposed in the window object so that the frontend has a means of accessing the IPC channels. This is required because the frontend client does not naturally have access to the `ipcRenderer` object to interact with IPC channels. An example of this can be seen in [ElectronPreload.ts](./src/frontend/ElectronPreload.ts).

2. The frontend client needs to create and use a basic class that interacts with the `ITwinElectronApi` that is referenced from the window object. It should setup not only listeners to react when a token is changed on the backend but also methods that will invoke the backend when a sign-in or sign-out needs to happen. An example of this class (`ElectronAuthIPC`) and how the frontend uses it can be seen in [FrontendClient.ts](./src/frontend/FrontendClient.ts).

3. The backend client needs to setup listeners via the `ipcMain` object from electron. The listeners should use the exact same channel names that the frontend uses. The listeners will response to requests to sign-in, sign-out, and retrieve the access token. When a token changes on the backend then it becomes necessary to send messages to the frontend unprovoked which cannot be done with the `ipcMain` object. Instead it must be done by accessing the window object's 'webContents' which has a `send` method that allows you to send data over a specific IPC channel name. An example of all this can be seen in [BackendClient.ts](./src/backend/BackendClient.ts).
