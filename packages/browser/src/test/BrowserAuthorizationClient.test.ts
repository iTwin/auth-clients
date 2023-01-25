/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { BrowserAuthorizationClient } from "../Client";
import { getImsAuthority } from "../utils";

import type { BrowserAuthorizationClientConfigurationOptions } from "../Client";

describe("BrowserAuthorizationClient", () => {

  describe("authority has correct prefix", () => {

    const browserConfiguration: BrowserAuthorizationClientConfigurationOptions = {
      clientId: "testClientId",
      redirectUri: "testClientSecret",
      scope: "testScope",
    };
    const testAuthority = "https://test.authority.com";

    it("should use config authority without prefix", async () => {
      process.env.IMJS_URL_PREFIX = "";
      const client = new BrowserAuthorizationClient({ ...browserConfiguration, authority: testAuthority });
      expect(client.authorityUrl).equals(testAuthority);
    });

    it("should use config authority and ignore prefix", async () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new BrowserAuthorizationClient({ ...browserConfiguration, authority: testAuthority });
      expect(client.authorityUrl).equals("https://test.authority.com");
    });

    it("should use default authority without prefix ", async () => {
      process.env.IMJS_URL_PREFIX = "";
      const client = new BrowserAuthorizationClient(browserConfiguration);
      expect(client.authorityUrl).equals("https://ims.bentley.com");
    });

    it("should use default authority with prefix ", async () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new BrowserAuthorizationClient(browserConfiguration);
      expect(client.authorityUrl).equals("https://prefix-ims.bentley.com");
    });

    it("should reroute dev prefix to qa if on default ", async () => {
      process.env.IMJS_URL_PREFIX = "dev-";
      const client = new BrowserAuthorizationClient(browserConfiguration);
      expect(client.authorityUrl).equals("https://qa-ims.bentley.com");
    });
  });

  describe("#constructor", () => {

    const TEST_AUTHORITY = "https://test.authority.com";

    let testClient: BrowserAuthorizationClient;
    let testConfig: BrowserAuthorizationClientConfigurationOptions;
    let testConfigWithoutAuthority: BrowserAuthorizationClientConfigurationOptions;

    before(() => {
      testConfigWithoutAuthority = {
        clientId: "test_clientId",
        redirectUri: "test_redirectUri",
        postSignoutRedirectUri: "test_postSignoutRedirectUri",
        scope: "test_scope",
        responseType: "test_responseType",
        noSilentSignInOnAppStartup: false,
        silentRedirectUri: "test_silentRedirectUri",
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
      assert.equal(settings.postSignoutRedirectUri, "test_postSignoutRedirectUri");
      assert.equal(settings.scope, "test_scope");
      assert.equal(settings.responseType, "test_responseType");
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

    it("given authority is when no prefix is defined", async () => {
      process.env.IMJS_URL_PREFIX = "";

      assert.equal(testClient.authorityUrl, TEST_AUTHORITY);
    });

    it("default authority is used when none is given", () => {
      const client = new BrowserAuthorizationClient(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority());
    });

    it("default authority is used and when none is given and uses environment prefix", () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new BrowserAuthorizationClient(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority());
    });
  });
});
