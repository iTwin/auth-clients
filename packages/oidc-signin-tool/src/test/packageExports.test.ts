/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See COPYRIGHT.md in the repository root for full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";

/* eslint-disable @typescript-eslint/no-require-imports */

// Resolves through the package name, so Node applies this package's `exports` map.
function load(specifier: string): Record<string, unknown> {
  return require(specifier) as Record<string, unknown>;
}

describe("package exports", () => {
  const entryPoints: Array<[string, string[]]> = [
    ["@itwin/oidc-signin-tool", ["TestBrowserAuthorizationClient", "getTestAccessToken", "TestUsers", "TestUtility"]],
    ["@itwin/oidc-signin-tool/frontend", ["TestUsers", "TestFrontendAuthorizationClient"]],
    ["@itwin/oidc-signin-tool/electron", ["loginElectronMainAuthClient", "logoutElectronMainAuthClient"]],
  ];

  for (const [specifier, names] of entryPoints) {
    it(`exposes ${specifier}`, () => {
      expect(load(specifier)).to.include.all.keys(names);
    });
  }

  it("does not export lib/cjs deep imports", () => {
    for (const specifier of [
      "@itwin/oidc-signin-tool/lib/cjs/frontend",
      "@itwin/oidc-signin-tool/lib/cjs/TestUsers",
      "@itwin/oidc-signin-tool/lib/cjs/loginElectronMainAuthClient",
      "@itwin/oidc-signin-tool/lib/cjs/SignInAutomation.js",
    ])
      expect(() => load(specifier), specifier).to.throw().with.property("code", "ERR_PACKAGE_PATH_NOT_EXPORTED");
  });
});
