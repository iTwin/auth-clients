/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import { BrowserAuthorizationClient } from "../Client";
import { getImsAuthority } from "../utils";
import type { BrowserAuthorizationClientConfiguration } from "../types";

describe("BrowserAuthorizationClient", () => {
  describe("#constructor", () => {
    const TEST_AUTHORITY = "https://test.authority.com";

    let testClient: BrowserAuthorizationClient;
    let testConfig: BrowserAuthorizationClientConfiguration;
    let testConfigWithoutAuthority: BrowserAuthorizationClientConfiguration;

    before(() => {
      testConfigWithoutAuthority = {
        clientId: "test_clientId",
        redirectUri: "test_redirectUri",
        postSignoutRedirectUri: "test_postSignoutRedirectUri",
        scope: "test_scope",
        responseType: "code",
        noSilentSignInOnAppStartup: false,
        silentRedirectUri: "test_silentRedirectUri",
        responseMode: "query",
      };

      testConfig = {
        ...testConfigWithoutAuthority,
        authority: TEST_AUTHORITY,
      };

      testClient = new BrowserAuthorizationClient(testConfig);
    });

    it("_basicSettings contains passed in configuration", () => {
      const settings = testClient["_basicSettings"]; // eslint-disable-line @typescript-eslint/dot-notation

      assert.equal(settings.authority, TEST_AUTHORITY);
      assert.equal(settings.clientId, "test_clientId");
      assert.equal(settings.redirectUri, "test_redirectUri");
      assert.equal(
        settings.postSignoutRedirectUri,
        "test_postSignoutRedirectUri",
      );
      assert.equal(settings.scope, "test_scope");
      assert.equal(settings.responseType, "code");
      assert.equal(settings.noSilentSignInOnAppStartup, false);
      assert.equal(settings.silentRedirectUri, "test_silentRedirectUri");
    });

    it("given authority is used", () => {
      assert.equal(testClient.authorityUrl, TEST_AUTHORITY);
    });

    it("given authority is used and environment prefix is ignored", async () => {
      process.env.IMJS_URL_PREFIX = "prefix-";

      assert.equal(testClient.authorityUrl, TEST_AUTHORITY);
    });

    it("given authority is used when no prefix is defined", async () => {
      process.env.IMJS_URL_PREFIX = "";

      assert.equal(testClient.authorityUrl, TEST_AUTHORITY);
    });

    it("default authority is used when none is given", () => {
      const client = new BrowserAuthorizationClient(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority()); // eslint-disable-line deprecation/deprecation
    });

    it("default authority is used and when none is given and uses environment prefix", () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new BrowserAuthorizationClient(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority()); // eslint-disable-line deprecation/deprecation
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
      const client = new BrowserAuthorizationClient(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority()); // eslint-disable-line deprecation/deprecation
    });

    it("default authority is used and when none is given and uses environment prefix", () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new BrowserAuthorizationClient(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority()); // eslint-disable-line deprecation/deprecation
    });

    it('successfully sets "query" as response mode', () => {
      const client = new BrowserAuthorizationClient({
        ...testConfig,
        responseMode: "query",
      });

      assert.equal(client["_basicSettings"].responseMode, "query"); // eslint-disable-line @typescript-eslint/dot-notation
    });

    it('successfully sets "fragment" as response mode', () => {
      const client = new BrowserAuthorizationClient({
        ...testConfig,
        responseMode: "fragment",
      });

      assert.equal(client["_basicSettings"].responseMode, "fragment"); // eslint-disable-line @typescript-eslint/dot-notation
    });
  });
});
