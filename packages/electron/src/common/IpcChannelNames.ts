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
 * @param channelClientPrefix Optional prefix to be prepended before the clientId to allow further namespacing of the channels.
 * @internal
 */
export function getIpcChannelNames(clientId: string, channelClientPrefix?: string): IpcChannelNames {
  const channelClientId = getPrefixedClientId(clientId, channelClientPrefix);

  return {
    signIn: `itwin.electron.auth.signIn-${channelClientId}`,
    signOut: `itwin.electron.auth.signOut-${channelClientId}`,
    getAccessToken: `itwin.electron.auth.getAccessToken-${channelClientId}`,
    onAccessTokenChanged: `itwin.electron.auth.onAccessTokenChanged-${channelClientId}`,
    onAccessTokenExpirationChanged: `itwin.electron.auth.onAccessTokenExpirationChanged-${channelClientId}`,
    signInSilent: `itwin.electron.auth.signInSilent-${channelClientId}`,
  };
}

/**
 * Get the clientId with an optional prefix.
 * @param clientId OIDC Client Id.
 * @param channelClientPrefix Optional prefix to be prepended before the clientId.
 * @internal
 */
export function getPrefixedClientId(clientId: string, channelClientPrefix?: string): string {
  return channelClientPrefix ? `${channelClientPrefix}-${clientId}` : clientId;
}
