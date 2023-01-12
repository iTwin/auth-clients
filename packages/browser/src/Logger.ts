/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module Logging
 */

import { Logger, LogLevel } from "@itwin/core-bentley";
import type { ILogger as IOidcClientLogger } from "oidc-client-ts";
import { Log as OidcClientLog } from "oidc-client-ts";
// import { Logger } from "oidc-client-ts"
import { BrowserAuthorizationLoggerCategory } from "./LoggerCategory";

/**
 * Utility to forward oidc-client logs to the Bentley logger
 * Because the logger used by the oidc-client library is static, we can't tie specific UserManager instances to different logging categories.
 * Thus, the best we can do is tie all logs originating from the library to a single logging category (derived from the name of this class).
 * @beta
 */
export class BrowserAuthorizationLogger implements IOidcClientLogger {
  private static initialized: boolean = false;

  private constructor() {
  }

  public debug(message?: any, ...optionalParams: any[]): void {
    Logger.logTrace(BrowserAuthorizationLoggerCategory.Authorization, message, () => optionalParams);
  }

  public info(message?: any, ...optionalParams: any[]): void {
    Logger.logInfo(BrowserAuthorizationLoggerCategory.Authorization, message, () => optionalParams);
  }

  public warn(message?: any, ...optionalParams: any[]): void {
    Logger.logWarning(BrowserAuthorizationLoggerCategory.Authorization, message, () => optionalParams);
  }

  public error(message?: any, ...optionalParams: any[]): void {
    Logger.logError(BrowserAuthorizationLoggerCategory.Authorization, message, () => optionalParams);
  }

  /** Initializes forwarding of OidcClient logs to the Bentley Logger */
  public static initializeLogger() {
    if (!BrowserAuthorizationLogger.initialized) {
      OidcClientLog.setLogger(new BrowserAuthorizationLogger());
    }

    BrowserAuthorizationLogger.initialized = true;
  }
}
