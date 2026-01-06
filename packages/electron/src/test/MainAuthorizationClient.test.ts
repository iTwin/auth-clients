/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { AuthorizationServiceConfiguration, TokenRequest } from "@openid/appauth";
import { BaseTokenRequestHandler } from "@openid/appauth";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import { ElectronMainAuthorization } from "../main/Client";
import { RefreshTokenStore } from "../main/TokenStore";
import { getConfig, getMockTokenResponse, setupMockAuthServer, stubTokenCrypto } from "./helpers/testHelper";
import type { AccessToken } from "@itwin/core-bentley";

/* eslint-disable @typescript-eslint/naming-convention */
const assert: Chai.AssertStatic = chai.assert; // ts is not able to fully infer the type of assert, so we need to explicitly set it.
const expect = chai.expect;

chai.use(chaiAsPromised);

/**
 * Produces a token store key using the same method as the Electron client
 */
function getTokenStoreKey(clientId: string, issuerUrl?: string): string {
  let prefix = process.env.IMJS_URL_PREFIX;
  const authority = new URL(issuerUrl ?? "https://ims.bentley.com");
  if (prefix && !issuerUrl) {
    prefix = prefix === "dev-" ? "qa-" : prefix;
    authority.hostname = prefix + authority.hostname;
  }
  issuerUrl = authority.href.replace(/\/$/, "");
  return `${getTokenStoreFileName(clientId)}:${issuerUrl}`;
}

function getTokenStoreFileName(clientId: string): string {
  return `iTwinJs_${clientId}`;
}

describe("ElectronMainAuthorization Token Logic", () => {
  beforeEach(function () {
    sinon.restore();
    // Stub Electron calls
    sinon.stub(ElectronMainAuthorization.prototype, "setupIPCHandlers" as any);
    sinon.stub(ElectronMainAuthorization.prototype, "notifyFrontendAccessTokenChange" as any);
    sinon.stub(ElectronMainAuthorization.prototype, "notifyFrontendAccessTokenExpirationChange" as any);
  });

  afterEach(function () {
    // eslint-disable-next-line deprecation/deprecation
    ElectronMainAuthorization.onUserStateChanged.clear();
  });

  it("Should throw if not signed in", async () => {
    const client = new ElectronMainAuthorization({
      clientId: "testClientId",
      scopes: "testScope",
      redirectUris: ["testRedirectUri_1", "testRedirectUri_2"],
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    chai.expect(client.getAccessToken).to.be.throw;
  });

  it("Should load token response from token store", async () => {
    const config = getConfig();
    const mockTokenResponse = getMockTokenResponse({ accessToken: "testAccessToken" });

    const refreshToken = "old refresh token";
    stubTokenCrypto(refreshToken);
    // Load refresh token into token store - use clientId
    const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId), getTokenStoreKey(config.clientId));
    await tokenStore.save(refreshToken);

    const spy = await setupMockAuthServer(mockTokenResponse);
    // Create client and silent sign in
    const client = new ElectronMainAuthorization(config);
    await client.signInSilent();

    // Get access token and assert its response equals what mock
    const returnedToken = await client.getAccessToken();
    assert.equal(returnedToken, `bearer ${mockTokenResponse.accessToken}`);
    sinon.assert.notCalled(spy);
  });

  it("Should sign in", async () => {
    const config = getConfig();
    const mockTokenResponse = getMockTokenResponse();

    stubTokenCrypto(mockTokenResponse.refreshToken!);
    // Clear token store
    const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId), getTokenStoreKey(config.clientId));
    await tokenStore.delete();

    await setupMockAuthServer(mockTokenResponse);
    // Create client and call initialize
    const client = new ElectronMainAuthorization(config);
    await client.signIn();

    const token = await client.getAccessToken();
    assert.equal(token, `bearer ${mockTokenResponse.accessToken}`);
  });

  it("Should refresh old token", async () => {
    const config = getConfig();
    const mockTokenResponse = getMockTokenResponse();

    const refreshToken = "old refresh token";
    stubTokenCrypto(refreshToken);
    // Load refresh token into token store - use clientId
    const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId), getTokenStoreKey(config.clientId));
    await tokenStore.save(refreshToken);

    await setupMockAuthServer(mockTokenResponse);
    // Create client and silent signin
    const client = new ElectronMainAuthorization(config);
    await client.signInSilent();

    // TODO: Need cleaner way to reset just one method (performTokenRequest)
    sinon.restore();
    sinon.stub(ElectronMainAuthorization.prototype, "notifyFrontendAccessTokenChange" as any);
    sinon.stub(ElectronMainAuthorization.prototype, "notifyFrontendAccessTokenExpirationChange" as any);
    sinon.stub(BaseTokenRequestHandler.prototype, "performTokenRequest").callsFake(async (_configuration: AuthorizationServiceConfiguration, _request: TokenRequest) => {
      return mockTokenResponse;
    });

    // Get access token and assert its response equals what mock
    const returnedToken = await client.getAccessToken();
    assert.equal(returnedToken, `bearer ${mockTokenResponse.accessToken}`);
  });

  it("should save new refresh token after signIn() when no electron-store token is present", async () => {
    const config = getConfig();
    const mockTokenResponse = getMockTokenResponse();
    stubTokenCrypto(mockTokenResponse.refreshToken!);

    // Clear token store
    const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId), getTokenStoreKey(config.clientId));
    await tokenStore.delete();

    await setupMockAuthServer(mockTokenResponse, {
      performTokenRequestCb: async () => {
        await tokenStore.save(mockTokenResponse.refreshToken!);
      },
    });

    const saveSpy = sinon.spy(tokenStore, "save");
    // Create client and call initialize
    const client = new ElectronMainAuthorization(config);
    await client.signIn();

    const token = await client.getAccessToken();
    assert.equal(token, `bearer ${mockTokenResponse.accessToken}`);
    assert.isTrue(saveSpy.calledOnce);
  });

  it("should load and decrypt refresh token on signIn() given an existing refresh token in electron-store", async () => {
    const config = getConfig();
    const mockTokenResponse = getMockTokenResponse({ accessToken: "testAccessToken" });

    const refreshToken = "old refresh token";
    const { decryptSpy } = stubTokenCrypto(refreshToken);

    // Load refresh token into token store - use clientId
    const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId), getTokenStoreKey(config.clientId));
    await tokenStore.delete();
    await tokenStore.save(refreshToken);

    const spy = await setupMockAuthServer(mockTokenResponse);

    // Create client and silent sign in
    const client = new ElectronMainAuthorization(config);
    await client.signIn();

    sinon.assert.notCalled(spy);
    assert.isTrue(decryptSpy.calledOnce);
  });

  it("should fire onUserStateChanged events", async () => {
    const staticEvents: AccessToken[] = [];
    const instanceEvents1: AccessToken[] = [];
    const instanceEvents2: AccessToken[] = [];
    const staticHandler = (token: AccessToken) => staticEvents.push(token);
    const instanceHandler1 = (token: AccessToken) =>
      instanceEvents1.push(token);
    const instanceHandler2 = (token: AccessToken) =>
      instanceEvents2.push(token);

    const config1 = getConfig({ clientId: "client1" });
    const config2 = getConfig({ clientId: "client2" });

    const mockTokenResponse = getMockTokenResponse();

    stubTokenCrypto(mockTokenResponse.refreshToken!);
    await setupMockAuthServer(mockTokenResponse);

    const client1 = new ElectronMainAuthorization(config1);
    const client2 = new ElectronMainAuthorization(config2);

    // eslint-disable-next-line deprecation/deprecation
    ElectronMainAuthorization.onUserStateChanged.addListener(staticHandler);
    client1.onUserStateChanged.addListener(instanceHandler1);
    client2.onUserStateChanged.addListener(instanceHandler2);

    await client1.signIn();
    expect(staticEvents.length).to.equal(1);
    expect(instanceEvents1.length).to.equal(1);
    expect(instanceEvents2.length).to.equal(0);

    await client2.signIn();
    expect(staticEvents.length).to.equal(2);
    expect(instanceEvents1.length).to.equal(1); // no change
    expect(instanceEvents2.length).to.equal(1);
  });
});

describe("ElectronMainAuthorization Authority URL Logic", () => {
  beforeEach(() => {
    sinon.restore();
    sinon.stub(ElectronMainAuthorization.prototype, "setupIPCHandlers" as any);
  });

  const config = getConfig();
  const testAuthority = "https://test.authority.com";

  it("should use config authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new ElectronMainAuthorization({ ...config, issuerUrl: testAuthority });
    expect(client.issuerUrl).equals(testAuthority);
  });

  it("should use config authority and ignore prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new ElectronMainAuthorization({ ...config, issuerUrl: testAuthority });
    expect(client.issuerUrl).equals("https://test.authority.com");
  });

  it("should use default authority without prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new ElectronMainAuthorization(config);
    expect(client.issuerUrl).equals("https://ims.bentley.com");
  });

  it("should use default authority with prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new ElectronMainAuthorization(config);
    expect(client.issuerUrl).equals("https://prefix-ims.bentley.com");
  });

  it("should reroute dev prefix to qa if on default ", async () => {
    process.env.IMJS_URL_PREFIX = "dev-";
    const client = new ElectronMainAuthorization(config);
    expect(client.issuerUrl).equals("https://qa-ims.bentley.com");
  });
});

describe("ElectronMainAuthorization Config Scope Logic", () => {
  beforeEach(() => {
    sinon.restore();
    sinon.stub(ElectronMainAuthorization.prototype, "setupIPCHandlers" as any);
  });

  it("Should add offline_access scope", async () => {
    const config = getConfig();
    const client = new ElectronMainAuthorization(config);
    expect(client.scopes).equals(`${config.scopes} offline_access`);
  });

  it("Should not add offline_access scope", async () => {
    const client = new ElectronMainAuthorization({
      clientId: "testClientId",
      scopes: "testScope offline_access",
      redirectUris: ["testRedirectUri_1", "testRedirectUri_2"],
    });
    expect(client.scopes).equals("testScope offline_access");
  });

  describe("scope changes", () => {
    beforeEach(() => {
      sinon.restore();
      // Stub Electron calls
      sinon.stub(ElectronMainAuthorization.prototype, "setupIPCHandlers" as any);
      sinon.stub(ElectronMainAuthorization.prototype, "notifyFrontendAccessTokenChange" as any);
      sinon.stub(ElectronMainAuthorization.prototype, "notifyFrontendAccessTokenExpirationChange" as any);
    });

    it("delete the current refresh token", async () => {
      const config = getConfig();
      const mockTokenResponse = getMockTokenResponse();

      stubTokenCrypto(mockTokenResponse.refreshToken!);

      await setupMockAuthServer(mockTokenResponse);

      const client = new ElectronMainAuthorization(config);
      expect(client.scopes).equals(`${config.scopes} offline_access`);
      await client.signIn();

      const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId), getTokenStoreKey(config.clientId));
      const token = await tokenStore.load("testScope offline_access");
      assert.equal(token, mockTokenResponse.refreshToken);

      const _token = await tokenStore.load("differetnTestScope offline_access");
      assert.equal(_token, undefined);
    });

    it("delete the current refresh token regardless of order", async () => {
      const config = getConfig({ scopes: "testScope blurgh-platform ReadTHINGS" });
      const mockTokenResponse = getMockTokenResponse();

      stubTokenCrypto(mockTokenResponse.refreshToken!);

      await setupMockAuthServer(mockTokenResponse);

      const client = new ElectronMainAuthorization(config);
      expect(client.scopes).equals("testScope blurgh-platform ReadTHINGS offline_access");
      await client.signIn();

      const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId), getTokenStoreKey(config.clientId));
      const token = await tokenStore.load("ReadTHINGS blurgh-platform offline_access testScope");
      assert.equal(token, mockTokenResponse.refreshToken);

      const _token = await tokenStore.load("ReadTHINGS offline_access testScope blurgh-platform new-scope");
      assert.equal(_token, undefined);
    });

    it("delete the current refresh token works with explicit offline_access added", async () => {
      const config = getConfig({ scopes: "testScope blurgh-platform offline_access ReadTHINGS" });
      const mockTokenResponse = getMockTokenResponse();

      stubTokenCrypto(mockTokenResponse.refreshToken!);

      await setupMockAuthServer(mockTokenResponse);

      const client = new ElectronMainAuthorization(config);
      expect(client.scopes).equals("testScope blurgh-platform offline_access ReadTHINGS");
      await client.signIn();

      const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId), getTokenStoreKey(config.clientId));
      const token = await tokenStore.load("offline_access ReadTHINGS blurgh-platform testScope");
      assert.equal(token, mockTokenResponse.refreshToken);

      const _token = await tokenStore.load("ReadTHINGS offline_access testScope blurgh-platform new-scope");
      assert.equal(_token, undefined);
    });
  });

});
