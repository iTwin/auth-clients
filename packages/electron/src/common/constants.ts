/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Main
 */

/**
 * Refresh token 10 minutes before real expiration time (by default)
 * @internal
 */
export const defaultExpiryBufferInSeconds = 600;

export const electronAuthLoggerCategory = "electron-auth";
