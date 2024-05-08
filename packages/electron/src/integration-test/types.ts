/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Options for signing in.
 */
export interface SignInOptions {
  clientId: string;
  email: string;
  password: string;
  envPrefix: string;
}
