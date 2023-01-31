/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { Log as OidcClientLog } from "oidc-client-ts";
import { Logger as BentleyLogger, LogLevel as BentleyLogLevel } from "@itwin/core-bentley";
import { BrowserAuthorizationLogger } from "../../Logger";
import { BrowserAuthorizationLoggerCategory } from "../../LoggerCategory";

import type { ILogger as IOidcClientLogger } from "oidc-client-ts";

function assertMessageLogged(logOutlet: any[], expectedMessage: string | undefined) {
  assert.isDefined(logOutlet, "no messages found");
  assert.equal(logOutlet[1], expectedMessage);
}

function assertMessageNotLogged(logOutlet: any[], expectedMessage: string | undefined) {
  if (logOutlet !== undefined) {
    assert.notEqual(logOutlet[1], expectedMessage);
  }
  // else don't need to assert, there's no messages to check against
}

describe("Logger", () => {

  let errorLogs: any[];
  let warningLogs: any[];
  let infoLogs: any[];
  let traceLogs: any[];

  before(() => {
    BentleyLogger.initialize(
      (c, m, d) => errorLogs = [c, m, d],
      (c, m, d) => warningLogs = [c, m, d],
      (c, m, d) => infoLogs = [c, m, d],
      (c, m, d) => traceLogs = [c, m, d]);
  });

  describe("#initializeLogger", () => {

    let oidcLogger: IOidcClientLogger;

    before(() => {
      BrowserAuthorizationLogger.initializeLogger();
      oidcLogger = new (BrowserAuthorizationLogger as any)();
    });

    it("log level is changed", () => {
      // Set log level to Info
      BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Info);

      oidcLogger.info("info_message");
      oidcLogger.error("info_message2");

      assertMessageLogged(infoLogs, "info_message");
      assertMessageLogged(errorLogs, "info_message2");

      // Overwrite log level to Warning
      BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Error);

      oidcLogger.info("error_message");
      oidcLogger.error("error_message2");

      assertMessageNotLogged(infoLogs, "error_message");
      assertMessageLogged(errorLogs, "error_message2");
    });

    describe("logs are forwarded to Bentley logger", () => {

      it("trace level logs", () => {
        BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Trace);
        oidcLogger.debug("trace_message");

        assertMessageLogged(traceLogs, "trace_message");
      });

      it("info level logs", () => {
        BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Info);
        oidcLogger.info("info_message");

        assertMessageLogged(infoLogs, "info_message");
      });

      it("warning level logs", () => {
        BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Warning);
        oidcLogger.warn("warning_message");

        assertMessageLogged(warningLogs, "warning_message");
      });

      it("error level logs", () => {
        BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Error);
        oidcLogger.error("error_message");

        assertMessageLogged(errorLogs, "error_message");
      });
    });
  });

  /**
   * The syntax `BrowserAuthorizationLogger["getLogLevel"]()` used below is to call
   * BrowserAuthorizationLogger.getLogLevel despite it being a protected method.
   * This works because once getLogLevel is compiled into JavaScript, there is no
   * form of protection.
   */
  describe("#getLogLevel", () => {

    it("Bentley trace log level maps to oidc debug log level", () => {
      BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Trace);
      const loglevel = BrowserAuthorizationLogger["getLogLevel"](BrowserAuthorizationLoggerCategory.Authorization); // eslint-disable-line @typescript-eslint/dot-notation

      assert.equal(loglevel, OidcClientLog.DEBUG);
    });

    it("Bentley info log level maps to oidc info log level", () => {
      BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Info);
      const loglevel = BrowserAuthorizationLogger["getLogLevel"](BrowserAuthorizationLoggerCategory.Authorization); // eslint-disable-line @typescript-eslint/dot-notation

      assert.equal(loglevel, OidcClientLog.INFO);
    });

    it("Bentley warning log level maps to oidc warn log level", () => {
      BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Warning);
      const loglevel = BrowserAuthorizationLogger["getLogLevel"](BrowserAuthorizationLoggerCategory.Authorization); // eslint-disable-line @typescript-eslint/dot-notation

      assert.equal(loglevel, OidcClientLog.WARN);
    });

    it("Bentley error log level maps to oidc error log level", () => {
      BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.Error);
      const loglevel = BrowserAuthorizationLogger["getLogLevel"](BrowserAuthorizationLoggerCategory.Authorization); // eslint-disable-line @typescript-eslint/dot-notation

      assert.equal(loglevel, OidcClientLog.ERROR);
    });

    it("Bentley none log level maps to oidc none log level", () => {
      BentleyLogger.setLevel(BrowserAuthorizationLoggerCategory.Authorization, BentleyLogLevel.None);
      const loglevel = BrowserAuthorizationLogger["getLogLevel"](BrowserAuthorizationLoggerCategory.Authorization); // eslint-disable-line @typescript-eslint/dot-notation

      assert.equal(loglevel, OidcClientLog.NONE);
    });

    it("undefined log level maps to oidc none log level", () => {
      // Note: No BentleyLogger level is set for BrowserAuthorizationLoggerCategory.Authorization
      const loglevel = BrowserAuthorizationLogger["getLogLevel"](BrowserAuthorizationLoggerCategory.Authorization); // eslint-disable-line @typescript-eslint/dot-notation

      assert.equal(loglevel, OidcClientLog.NONE);
    });
  });

});
