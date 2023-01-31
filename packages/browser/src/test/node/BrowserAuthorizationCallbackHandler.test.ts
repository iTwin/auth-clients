/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { BrowserAuthorizationCallbackHandler } from "../../CallbackHandler";
import { getImsAuthority } from "../../utils";

import type { BrowserAuthorizationCallbackHandlerConfiguration } from "../../CallbackHandler";

describe("BrowserAuthorizationCallbackHandler", () => {

  describe("#constructor", () => {

    const TEST_AUTHORITY = "https://test.authority.com";

    let testClient: BrowserAuthorizationCallbackHandler;
    let testConfig: BrowserAuthorizationCallbackHandlerConfiguration;
    let testConfigWithoutAuthority: BrowserAuthorizationCallbackHandlerConfiguration;

    before(() => {
      testConfigWithoutAuthority = {
        clientId: "test_clientId",
        redirectUri: "test_redirectUri",
        responseMode: "query",
      };

      testConfig = {
        ...testConfigWithoutAuthority,
        authority: TEST_AUTHORITY,
      };

      testClient = new (BrowserAuthorizationCallbackHandler as any)(testConfig);
    });

    it("_basicSettings contains passed in configuration", () => {
      const settings = testClient["_basicSettings"]; // eslint-disable-line @typescript-eslint/dot-notation

      assert.equal(settings.authority, TEST_AUTHORITY);
      assert.equal(settings.clientId, "test_clientId");
      assert.equal(settings.redirectUri, "test_redirectUri");
      assert.equal(settings.responseMode, "query");
    });

    it("given authority is used", () => {
      assert.equal(testClient.authorityUrl, TEST_AUTHORITY);
    });

    it("given authority is used and environment prefix is ignored", async () => {
      process.env.IMJS_URL_PREFIX = "prefix-";

      assert.equal(testClient.authorityUrl, TEST_AUTHORITY);
    });

    it("given authority is when no prefix is defined", async () => {
      process.env.IMJS_URL_PREFIX = "";

      assert.equal(testClient.authorityUrl, TEST_AUTHORITY);
    });

    it("default authority is used when none is given", () => {
      const client = new (BrowserAuthorizationCallbackHandler as any)(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority());
    });

    it("default authority is used and when none is given and uses environment prefix", () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new (BrowserAuthorizationCallbackHandler as any)(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority());
    });

    it("successfully sets \"query\" as response mode", () => {
      const client = new (BrowserAuthorizationCallbackHandler as any)({ ...testConfig, responseMode: "query" });

      assert.equal(client["_basicSettings"].responseMode, "query"); // eslint-disable-line @typescript-eslint/dot-notation
    });

    it("successfully sets \"fragment\" as response mode", () => {
      const client = new (BrowserAuthorizationCallbackHandler as any)({ ...testConfig, responseMode: "fragment" });

      assert.equal(client["_basicSettings"].responseMode, "fragment"); // eslint-disable-line @typescript-eslint/dot-notation
    });
  });
});
