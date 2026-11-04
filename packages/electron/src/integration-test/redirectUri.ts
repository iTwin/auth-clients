/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Redirect URI used by the test app. The tests need the port to check that it has been
 * released between app launches, so it is shared instead of duplicated.
 */
export const redirectUri = "http://localhost:3000/signin-callback";
