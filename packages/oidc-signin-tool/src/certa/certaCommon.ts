/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { executeBackendCallback } from "@itwin/certa/lib/utils/CallbackUtils";
import type { TestBrowserAuthorizationClientConfiguration, TestUserCredentials } from "../TestUsers";
import type { ServiceAuthorizationClientConfiguration } from "@itwin/service-authorization";

// Shared by both the frontend and backend side of the tests
export const getTokenCallbackName = "getToken";
export const getServiceAuthTokenCallbackName = "getServiceAuthToken";

/**
 * Retrieves an access token from the backend using the specified user credentials.
 */
export async function getAccessTokenFromBackend(user: TestUserCredentials, oidcConfig?: TestBrowserAuthorizationClientConfiguration): Promise<string> {
  const accessToken = await executeBackendCallback(getTokenCallbackName, user, oidcConfig);
  return accessToken;
}

/**
 * Retrieves a service authorization token from the backend.
 */
export async function getServiceAuthTokenFromBackend(oidcConfig: ServiceAuthorizationClientConfiguration): Promise<string> {
  const accessToken = await executeBackendCallback(getServiceAuthTokenCallbackName, oidcConfig);
  return accessToken;
}
