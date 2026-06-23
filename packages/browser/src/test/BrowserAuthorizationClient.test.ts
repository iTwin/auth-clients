/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { assert } from "chai";
import type { ExtraHeader, UserManagerSettings } from "oidc-client-ts";
import { BrowserAuthorizationClient } from "../Client";
import { getImsAuthority } from "../utils";
import type { BrowserAuthorizationClientConfiguration } from "../types";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class TestableBrowserAuthorizationClient extends BrowserAuthorizationClient {
  public async getSettingsForTest(
    basicSettings: BrowserAuthorizationClientConfiguration,
    advancedSettings?: UserManagerSettings,
  ) {
    return this.getUserManagerSettings(basicSettings, advancedSettings);
  }
}

function getCorrelationIdHeader(header: ExtraHeader | undefined): () => string {
  if (typeof header !== "function")
    throw new Error("Expected x-correlation-id extra header to be a function");

  return header;
}

function createStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => Array.from(items.keys())[index] ?? null,
    removeItem: (key: string) => items.delete(key),
    setItem: (key: string, value: string) => items.set(key, value),
  };
}

describe("BrowserAuthorizationClient", () => {
  let originalWindowDescriptor: PropertyDescriptor | undefined;

  before(() => {
    originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: createStorage() },
    });
  });

  after(() => {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
      return;
    }

    Reflect.deleteProperty(globalThis, "window");
  });

  describe("#constructor", () => {
    const TEST_AUTHORITY = "https://test.authority.com";
    const IMS_AUTHORITY = "https://qa-ims.bentley.com";

    let testClient: BrowserAuthorizationClient;
    let testConfig: BrowserAuthorizationClientConfiguration;
    let imsConfig: BrowserAuthorizationClientConfiguration;
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

      imsConfig = {
        ...testConfigWithoutAuthority,
        authority: IMS_AUTHORITY,
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

    it("adds a unique x-correlation-id header generator", async () => {
      const client = new TestableBrowserAuthorizationClient(imsConfig);
      const settings = await client.getSettingsForTest(imsConfig);

      const correlationIdHeader = getCorrelationIdHeader(settings.extraHeaders?.["x-correlation-id"]);
      const firstCorrelationId = correlationIdHeader();
      const secondCorrelationId = correlationIdHeader();

      assert.match(firstCorrelationId, uuidRegex);
      assert.match(secondCorrelationId, uuidRegex);
      assert.notEqual(firstCorrelationId, secondCorrelationId);
    });

    it("adds IMS metadata when x-correlation-id headers are configured", async () => {
      const client = new TestableBrowserAuthorizationClient(imsConfig);
      const settings = await client.getSettingsForTest(imsConfig);

      assert.equal(settings.metadata?.issuer, IMS_AUTHORITY);
      assert.equal(settings.metadata?.authorization_endpoint, `${IMS_AUTHORITY}/connect/authorize`);
      assert.equal(settings.metadata?.token_endpoint, `${IMS_AUTHORITY}/connect/token`);
      assert.equal(settings.metadata?.end_session_endpoint, `${IMS_AUTHORITY}/connect/endsession`);
    });

    it("does not add x-correlation-id headers for non-IMS authorities", async () => {
      const client = new TestableBrowserAuthorizationClient(testConfig);
      const settings = await client.getSettingsForTest(testConfig);

      assert.isUndefined(settings.extraHeaders?.["x-correlation-id"]);
    });

    it("preserves configured extra headers", async () => {
      const client = new TestableBrowserAuthorizationClient(testConfig);
      const settings = await client.getSettingsForTest(testConfig, {
        /* eslint-disable @typescript-eslint/naming-convention */
        authority: TEST_AUTHORITY,
        client_id: testConfig.clientId,
        redirect_uri: testConfig.redirectUri,
        /* eslint-enable @typescript-eslint/naming-convention */
        scope: testConfig.scope,
        extraHeaders: {
          "x-existing-header": "existing-value",
        },
      });

      assert.equal(settings.extraHeaders?.["x-existing-header"], "existing-value");
    });
  });
});
