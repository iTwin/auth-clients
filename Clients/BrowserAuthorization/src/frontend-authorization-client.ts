/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
export * from "./FrontendAuthorizationClient";
export * from "./FrontendAuthorizationClientLoggerCategory";

export * from "./browser/BrowserAuthorizationBase";
export * from "./browser/BrowserAuthorizationCallbackHandler";
export * from "./browser/BrowserAuthorizationClient";
export * from "./browser/BrowserAuthorizationClientRedirectState";
export * from "./browser/BrowserAuthorizationLogger";

/** @docs-package-description
 * The frontend-authorization-client package contains classes and structures relevant to user authentication/authorization in frontend applications, with specific implementations for web browser use-cases.
 */

/**
 * @docs-group-description Authorization
 * Classes for signing a user in and out of an auth service.
 */

/**
 * @docs-group-description BrowserAuthorization
 * Classes for signing a user in and out of an auth service via a web browser.
 */

/**
 * @docs-group-description Logging
 * Logger categories used by this package.
 */
