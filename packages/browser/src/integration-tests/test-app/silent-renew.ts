/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { BrowserAuthorizationClient } from "../../Client";
// // This page handles the silent renew callback in an iframe
// // It's intentionally minimal to load quickly

BrowserAuthorizationClient.handleSignInCallback();
