/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { BrowserAuthorizationClient } from "../Client";
import { getImsAuthority } from "../utils";

import type { BrowserAuthorizationClientConfiguration } from "../Client";

describe("BrowserAuthorizationClient", () => {

  describe("authority has correct prefix", () => {

    const browserConfiguration: BrowserAuthorizationClientConfiguration = {
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

    let testClient: BrowserAuthorizationClient;
    let testConfig: BrowserAuthorizationClientConfiguration;

    before(() => {
      testConfig = {
        authority: "test_authority",
        clientId: "test_clientId",
        redirectUri: "test_redirectUri",
        postSignoutRedirectUri: "test_postSignoutRedirectUri",
        scope: "test_scope",
        responseType: "test_responseType",
        noSilentSignInOnAppStartup: false,
        silentRedirectUri: "test_silentRedirectUri",
      };

      testClient = new BrowserAuthorizationClient(testConfig);
    });

    it("_basicSettings contains passed in configuration", () => {
      const settings = testClient["_basicSettings"]; // eslint-disable-line @typescript-eslint/dot-notation

      assert.equal(settings.authority, "test_authority");
      assert.equal(settings.clientId, "test_clientId");
      assert.equal(settings.redirectUri, "test_redirectUri");
      assert.equal(settings.postSignoutRedirectUri, "test_postSignoutRedirectUri");
      assert.equal(settings.scope, "test_scope");
      assert.equal(settings.responseType, "test_responseType");
      assert.equal(settings.noSilentSignInOnAppStartup, false);
      assert.equal(settings.silentRedirectUri, "test_silentRedirectUri");
    });

    it("given authority is used", () => {
      assert.equal(testClient.authorityUrl, "test_authority");
    });

    it("default authority is used when none is given", () => {
      const config = {
        clientId: "test_clientId",
        redirectUri: "test_redirectUri",
        scope: "test_scope",
      };

      const client = new BrowserAuthorizationClient(config);

      // getImsAuthority manages getting the default authority
      assert.equal(client.authorityUrl, getImsAuthority());
    });
  });
});
