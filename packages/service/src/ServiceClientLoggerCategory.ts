/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Logging
 */

/** Logger categories used by this package
 * @note All logger categories in this package start with the `service-client` prefix.
 * @see [Logger]($bentley)
 * @public
 */
export enum ServiceClientLoggerCategory {
  /** The logger category used for the authorization */
  Authorization = "service-client.Authorization",

  /** The logger category used for introspection */
  Introspection = "service-client.Introspection",
}
