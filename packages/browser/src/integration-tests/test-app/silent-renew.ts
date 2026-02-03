/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { BrowserAuthorizationClient } from "../../Client";

// import { UserManager } from "oidc-client-ts";

// // This page handles the silent renew callback in an iframe
// // It's intentionally minimal to load quickly
// // We use signinSilentCallback directly because BrowserAuthorizationClient.handleSignInCallback
// // checks against redirectUri, not silentRedirectUri
// new UserManager({ authority: "", client_id: "" }).signinSilentCallback();
BrowserAuthorizationClient.handleSignInCallback();
