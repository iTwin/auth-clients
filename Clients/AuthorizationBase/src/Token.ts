/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/**
 * Function to remove any prefix from an access token string.
 * @param accessToken Access token string
 * @internal
 */
 export function removeAccessTokenPrefix(accessToken: AccessToken | undefined): AccessToken | undefined {
  return accessToken ? accessToken.substr(accessToken.indexOf(" ") + 1) : undefined;
}

export type AccessToken = string;
