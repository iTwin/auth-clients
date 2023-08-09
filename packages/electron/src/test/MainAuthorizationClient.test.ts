/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import type { AuthorizationListener, AuthorizationServiceConfiguration, TokenRequest } from "@openid/appauth";
import { AuthorizationNotifier, AuthorizationRequest, AuthorizationResponse, BaseTokenRequestHandler, TokenResponse } from "@openid/appauth";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import type { ElectronMainAuthorizationConfiguration } from "../main/Client";
import { ElectronMainAuthorization } from "../main/Client";
import { ElectronMainAuthorizationRequestHandler } from "../main/ElectronMainAuthorizationRequestHandler";
import { LoopbackWebServer } from "../main/LoopbackWebServer";
import { RefreshTokenStore } from "../main/TokenStore";
import * as keytar from "keytar";
/* eslint-disable @typescript-eslint/naming-convention */
const assert = chai.assert;
const expect = chai.expect;

chai.use(chaiAsPromised);

/**
 * Produces a token store key using the same method as the Electron client
 * @param clientId
 * @param issuerUrl
 * @returns
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
  return `iTwinJs:${clientId}`;
}

describe("ElectronMainAuthorization Token Logic", () => {
  beforeEach(function () {
    sinon.restore();
    // Stub Electron calls
    sinon.stub(ElectronMainAuthorization.prototype, "setupIPCHandlers" as any);
    sinon.stub(ElectronMainAuthorization.prototype, "notifyFrontendAccessTokenChange" as any);
    sinon.stub(ElectronMainAuthorization.prototype, "notifyFrontendAccessTokenExpirationChange" as any);
    sinon.stub(keytar, "deletePassword"); // ideally would not stub more than needed, but deletePassword throws "unknown error" randomly... replacing keytar soon anyway
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
    const config: ElectronMainAuthorizationConfiguration = {
      clientId: "testClientId",
      scopes: "testScope",
      redirectUris: ["testRedirectUri_1", "testRedirectUri_2"],
    };
    const mockTokenResponseJson = {
      access_token: "testAccessToken",
      refresh_token: "testRefreshToken",
      issued_at: (new Date()).getTime(),
      expires_in: "60000",
    };
    const mockTokenResponse = new TokenResponse(mockTokenResponseJson);

    const refreshToken = "old refresh token";
    sinon.stub(RefreshTokenStore.prototype, "encryptRefreshToken" as any).returns(Buffer.from(refreshToken));
    sinon.stub(RefreshTokenStore.prototype, "decryptRefreshToken" as any).returns(refreshToken);
    // Load refresh token into token store - use clientId
    const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId),getTokenStoreKey(config.clientId));
    await tokenStore.save(refreshToken);

    // Mock auth request
    const spy = sinon.fake();
    sinon.stub(ElectronMainAuthorization.prototype, "refreshToken").callsFake(spy);
    sinon.stub(BaseTokenRequestHandler.prototype, "performTokenRequest").callsFake(async (_configuration: AuthorizationServiceConfiguration, _request: TokenRequest) => {
      return mockTokenResponse;
    });

    // Create client and silent sign in
    const client = new ElectronMainAuthorization(config);
    await client.signInSilent();

    // Get access token and assert its response equals what mock
    const returnedToken = await client.getAccessToken();
    assert.equal(returnedToken, `bearer ${mockTokenResponse.accessToken}`);
    sinon.assert.notCalled(spy);
  });

  it("Should sign in", async () => {
    const config: ElectronMainAuthorizationConfiguration = {
      clientId: "testClientId",
      scopes: "testScope",
      redirectUris: ["testRedirectUri_1", "testRedirectUri_2"],
    };
    const mockTokenResponse: TokenResponse = new TokenResponse(
      {
        access_token: "testAccessTokenSignInTest",
        refresh_token: "testRefreshToken",
        issued_at: (new Date()).getTime() / 1000,
        expires_in: "60000",
      });

    sinon.stub(RefreshTokenStore.prototype, "encryptRefreshToken" as any).returns(Buffer.from(mockTokenResponse.refreshToken!));
    sinon.stub(RefreshTokenStore.prototype, "decryptRefreshToken" as any).returns(mockTokenResponse.refreshToken);
    // Clear token store
    const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId),getTokenStoreKey(config.clientId));
    await tokenStore.delete();

    // Mock auth request
    sinon.stub(LoopbackWebServer, "start").resolves();
    sinon.stub(ElectronMainAuthorizationRequestHandler.prototype, "performAuthorizationRequest").callsFake(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    sinon.stub(BaseTokenRequestHandler.prototype, "performTokenRequest").callsFake(async (_configuration: AuthorizationServiceConfiguration, _request: TokenRequest) => {
      return mockTokenResponse;
    });
    sinon.stub(AuthorizationNotifier.prototype, "setAuthorizationListener").callsFake((listener: AuthorizationListener) => {
      const authRequest = new AuthorizationRequest({
        response_type: "testResponseType",
        client_id: "testClient",
        redirect_uri: "testRedirect",
        scope: "testScope",
        internal: { code_verifier: "testCodeVerifier" },
        state: "testState",
      });

      const authResponse = new AuthorizationResponse({ code: "testCode", state: "testState" });
      listener(authRequest, authResponse, null);
    });

    // Create client and call initialize
    const client = new ElectronMainAuthorization(config);
    await client.signIn();

    const token = await client.getAccessToken();
    assert.equal(token, `bearer ${mockTokenResponse.accessToken}`);
  });

  it("Should refresh old token", async () => {
    const config: ElectronMainAuthorizationConfiguration = {
      clientId: "testClientId",
      scopes: "testScope",
      redirectUris: ["testRedirectUri_1", "testRedirectUri_2"],
    };
    const mockTokenResponse: TokenResponse = new TokenResponse(
      {
        access_token: "testAccessToken",
        refresh_token: "testRefreshToken",
        issued_at: new Date().getTime() / 1000,
        expires_in: "60000",
      });

    const refreshToken = "old refresh token";
    sinon.stub(RefreshTokenStore.prototype, "encryptRefreshToken" as any).returns(Buffer.from(refreshToken));
    sinon.stub(RefreshTokenStore.prototype, "decryptRefreshToken" as any).returns(refreshToken);
    // Load refresh token into token store - use clientId
    const tokenStore = new RefreshTokenStore(getTokenStoreFileName(config.clientId),getTokenStoreKey(config.clientId));
    await tokenStore.save(refreshToken);

    // Mock auth request
    sinon.stub(BaseTokenRequestHandler.prototype, "performTokenRequest").callsFake(async (_configuration: AuthorizationServiceConfiguration, _request: TokenRequest) => {
      return mockTokenResponse;
    });

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
});

describe("ElectronMainAuthorization Authority URL Logic", () => {
  beforeEach(() => {
    sinon.restore();
    sinon.stub(ElectronMainAuthorization.prototype, "setupIPCHandlers" as any);
  });

  const config: ElectronMainAuthorizationConfiguration = {
    clientId: "testClientId",
    scopes: "testScope",
    redirectUris: ["testRedirectUri_1", "testRedirectUri_2"],
  };
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

  const config: ElectronMainAuthorizationConfiguration = {
    clientId: "testClientId",
    scopes: "testScope",
    redirectUris: ["testRedirectUri_1", "testRedirectUri_2"],
  };

  it("Should add offline_access scope", async () => {
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
});
