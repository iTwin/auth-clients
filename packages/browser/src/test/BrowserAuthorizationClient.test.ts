/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import * as sinon from "sinon";
import type { User } from "oidc-client-ts";
import { BrowserAuthorizationClient } from "../Client";
import { getImsAuthority } from "../utils";
import type { BrowserAuthorizationClientConfiguration } from "../types";

describe("BrowserAuthorizationClient", () => {
  const TEST_AUTHORITY = "https://test.authority.com";
  const TEST_CONFIG: BrowserAuthorizationClientConfiguration = {
    authority: TEST_AUTHORITY,
    clientId: "test_clientId",
    redirectUri: "test_redirectUri",
    postSignoutRedirectUri: "test_postSignoutRedirectUri",
    scope: "test_scope",
    responseType: "code",
    noSilentSignInOnAppStartup: false,
    silentRedirectUri: "test_silentRedirectUri",
    responseMode: "query",
  };

  describe("#constructor", () => {
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
      assert.equal(client.authorityUrl, getImsAuthority()); // eslint-disable-line @typescript-eslint/no-deprecated
    });

    it("default authority is used and when none is given and uses environment prefix", () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new BrowserAuthorizationClient(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority()); // eslint-disable-line @typescript-eslint/no-deprecated
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
      assert.equal(client.authorityUrl, getImsAuthority()); // eslint-disable-line @typescript-eslint/no-deprecated
    });

    it("default authority is used and when none is given and uses environment prefix", () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new BrowserAuthorizationClient(testConfigWithoutAuthority);

      // getImsAuthority manages the value of the default authority
      assert.equal(client.authorityUrl, getImsAuthority()); // eslint-disable-line @typescript-eslint/no-deprecated
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

  describe("#forceSilentRenew", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("calls signinSilent on the underlying user manager", async () => {
      const client = new BrowserAuthorizationClient(TEST_CONFIG);
      const signinSilent = sinon.stub().resolves({ expired: false } as User);
      sinon
        .stub(client as any, "getUserManager")
        .resolves({ signinSilent } as any);

      await client.forceSilentRenew();

      sinon.assert.calledOnce(signinSilent);
    });

    it("throws when silent renew does not return an active user", async () => {
      const client = new BrowserAuthorizationClient(TEST_CONFIG);
      const signinSilent = sinon.stub().resolves({ expired: true } as User);
      sinon
        .stub(client as any, "getUserManager")
        .resolves({ signinSilent } as any);

      try {
        await client.forceSilentRenew();
        assert.fail("Expected forceSilentRenew to throw");
      } catch (error: any) {
        assert.equal(error.message, "Authorization error: Silent sign-in failed");
      }
    });
  });

  describe("#accessTokenExpiresAt", () => {
    it("returns a copy of the current access token expiration time", () => {
      const client = new BrowserAuthorizationClient(TEST_CONFIG);
      const expiresAt = new Date("2026-01-01T00:00:00.000Z");
      client["_expiresAt"] = expiresAt; // eslint-disable-line @typescript-eslint/dot-notation

      const result = client.accessTokenExpiresAt;

      assert.deepEqual(result, expiresAt);
      assert.notStrictEqual(result, expiresAt);
    });
  });
});
