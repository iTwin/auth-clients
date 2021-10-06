/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Logging
 */

/** Logger categories used by this package
 * @note All logger categories in this package start with the `browser-authorization` prefix.
 * @see [Logger]($bentley)
 * @beta
 */
export enum BrowserAuthorizationLoggerCategory {
  /** The logger category used by base clients */
  Authorization = "browser-authorization.Authorization",
}
