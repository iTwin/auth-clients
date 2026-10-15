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

  it("keeps resolving existing lib/cjs deep imports", () => {
    expect(load("@itwin/oidc-signin-tool/lib/cjs/TestUsers")).to.have.property("TestUsers");
    expect(load("@itwin/oidc-signin-tool/lib/cjs/frontend.js")).to.have.property("TestFrontendAuthorizationClient");
    expect(load("@itwin/oidc-signin-tool/lib/cjs/loginElectronMainAuthClient")).to.have.property("loginElectronMainAuthClient");
  });

  it("does not expose Certa helpers", () => {
    expect(load("@itwin/oidc-signin-tool/frontend")).to.not.have.any.keys("getAccessTokenFromBackend", "getServiceAuthTokenFromBackend");
    expect(() => load("@itwin/oidc-signin-tool/lib/cjs/certa/certaBackend")).to.throw(/Cannot find module/);
  });
});
