/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/**
 * IPC channel names used for exchanging messages between {@link ElectronRendererAuthorization} and
 * {@link ElectronMainAuthorization} instances.
 * @internal
 */
export interface IpcChannelNames {
  readonly signIn: string;
  readonly signOut: string;
  readonly getAccessToken: string;
  readonly onAccessTokenChanged: string;
  readonly onAccessTokenExpirationChanged: string;
  readonly signInSilent: string;
}

/**
 * Construct an instance of {@link IpcChannelNames} with unique channel names per given clientId.
 * @param clientId OIDC Client Id.
 * @internal
 */
export function getIpcChannelNames(clientId: string): IpcChannelNames {
  return {
    signIn: `itwin.electron.auth.signIn-${clientId}`,
    signOut: `itwin.electron.auth.signOut-${clientId}`,
    getAccessToken: `itwin.electron.auth.getAccessToken-${clientId}`,
    onAccessTokenChanged: `itwin.electron.auth.onAccessTokenChanged-${clientId}`,
    onAccessTokenExpirationChanged: `itwin.electron.auth.onAccessTokenExpirationChanged-${clientId}`,
    signInSilent: `itwin.electron.auth.signInSilent-${clientId}`,
  };
}
