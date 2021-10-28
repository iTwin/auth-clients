/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import * as sinon from "sinon";
import { ElectronAuthorizationBackend } from "../backend/BackendClient";
import { NativeAppAuthorizationConfiguration } from "@itwin/core-common";
import { ElectronTokenStore } from "../backend/TokenStore";
import { AuthorizationListener, AuthorizationNotifier, AuthorizationRequest,  AuthorizationResponse, AuthorizationServiceConfiguration, BaseTokenRequestHandler, TokenRequest, TokenResponse } from "@openid/appauth";
import { LoopbackWebServer } from "../backend/LoopbackWebServer";
import { ElectronAuthorizationRequestHandler } from "../backend/ElectronAuthorizationRequestHandler";

describe("ElectronAuthorizationBackend Token Logic", () => {
  beforeEach(()=>{
    sinon.restore();
    // Stub Electron calls
    sinon.stub(ElectronAuthorizationBackend.prototype, "setupIPCHandlers" as any);
    sinon.stub(ElectronAuthorizationBackend.prototype, "notifyFrontendAccessTokenChange" as any);
    sinon.stub(ElectronAuthorizationBackend.prototype, "notifyFrontendAccessTokenExpirationChange" as any);
  });

  it("Should throw if not signed in", async () =>{
    const client = new ElectronAuthorizationBackend();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    chai.expect(client.getAccessToken).to.be.throw;
  });

  it("Should load token response from token store", async () =>{
    const config: NativeAppAuthorizationConfiguration = {
      clientId: "testClientId",
      scope: "testScope",
    };
    /* eslint-disable @typescript-eslint/naming-convention */
    const mockTokenResponse: TokenResponse = new TokenResponse(
      {
        access_token:"testAccessToken",
        refresh_token:"testRefreshToken",
        issued_at: (new Date()).getTime(),
        expires_in: "60000",
      });
      /* eslint-enable @typescript-eslint/naming-convention */

    // Load tokenResponse into token store - use clientId
    const tokenStore = new ElectronTokenStore(config.clientId);
    await tokenStore.save(mockTokenResponse);

    // Mock auth request
    const spy = sinon.fake();
    sinon.stub(ElectronAuthorizationBackend.prototype, "refreshToken").callsFake(spy);
    sinon.stub(BaseTokenRequestHandler.prototype, "performTokenRequest").callsFake(async (_configuration: AuthorizationServiceConfiguration, _request: TokenRequest) => {
      return mockTokenResponse;
    });

    // Create client and call initialize
    const client = new ElectronAuthorizationBackend(config);
    await client.initialize();

    // Get access token and assert its response equals what mock
    const returnedToken = await client.getAccessToken();
    chai.assert.equal(returnedToken, `bearer ${mockTokenResponse.accessToken}`);
    sinon.assert.notCalled(spy);
  });

  it("Should sign in", async () =>{
    const config: NativeAppAuthorizationConfiguration = {
      clientId: "testClientId",
      scope: "testScope",
    };
    /* eslint-disable @typescript-eslint/naming-convention */
    const mockTokenResponse: TokenResponse = new TokenResponse(
      {
        access_token:"testAccessTokenSignInTest",
        refresh_token:"testRefreshToken",
        issued_at: (new Date()).getTime() / 1000,
        expires_in: "60000",
      });
    /* eslint-enable @typescript-eslint/naming-convention */

    // Clear token store
    const tokenStore = new ElectronTokenStore(config.clientId);
    await tokenStore.delete();

    // Mock auth request
    const mockLoopbackStart = sinon.fake();
    sinon.stub(LoopbackWebServer, "start").callsFake(mockLoopbackStart);
    sinon.stub(ElectronAuthorizationRequestHandler.prototype, "performAuthorizationRequest").callsFake(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    sinon.stub(BaseTokenRequestHandler.prototype, "performTokenRequest").callsFake(async (_configuration: AuthorizationServiceConfiguration, _request: TokenRequest) => {
      return mockTokenResponse;
    });
    sinon.stub(AuthorizationNotifier.prototype, "setAuthorizationListener").callsFake((listener: AuthorizationListener) => {
    /* eslint-disable @typescript-eslint/naming-convention */
      const authRequest = new AuthorizationRequest({
        response_type: "testResponseType",
        client_id: "testClient",
        redirect_uri: "testRedirect",
        scope: "testScope",
        internal: {code_verifier:"testCodeVerifier"},
        state: "testState",
      });
      /* eslint-enable @typescript-eslint/naming-convention */

      const authResponse = new AuthorizationResponse({code:"testCode", state:"testState"});
      listener(authRequest, authResponse, null);
    });

    // Create client and call initialize
    const client = new ElectronAuthorizationBackend(config);
    await client.initialize();
    await client.signIn();

    const token = await client.getAccessToken();
    chai.assert.equal(token,`bearer ${mockTokenResponse.accessToken}`);
    sinon.assert.called(mockLoopbackStart);
  });

  it("Should refresh old token", async () =>{
    const config: NativeAppAuthorizationConfiguration = {
      clientId: "testClientId",
      scope: "testScope",
    };
    /* eslint-disable @typescript-eslint/naming-convention */
    const mockExpiredTokenResponse: TokenResponse = new TokenResponse(
      {
        access_token:"testExpiredAccessToken",
        refresh_token:"testRefreshToken",
        issued_at: (new Date("1-1-2000")).getTime() / 1000,
        expires_in: "60000",
      });
    const mockTokenResponse: TokenResponse = new TokenResponse(
      {
        access_token:"testAccessToken",
        refresh_token:"testRefreshToken",
        issued_at: new Date().getTime() / 1000,
        expires_in: "60000",
      });
    /* eslint-enable @typescript-eslint/naming-convention */

    // Load tokenResponse into token store - use clientId
    const tokenStore = new ElectronTokenStore(config.clientId);
    await tokenStore.save(mockExpiredTokenResponse);

    // Mock auth request
    sinon.stub(BaseTokenRequestHandler.prototype, "performTokenRequest").callsFake(async (_configuration: AuthorizationServiceConfiguration, _request: TokenRequest) => {
      return mockExpiredTokenResponse;
    });

    // Create client and call initialize
    const client = new ElectronAuthorizationBackend(config);
    await client.initialize();

    // TODO: Need cleaner way to reset just one method (performTokenRequest)
    sinon.restore();
    sinon.stub(ElectronAuthorizationBackend.prototype, "notifyFrontendAccessTokenChange" as any);
    sinon.stub(ElectronAuthorizationBackend.prototype, "notifyFrontendAccessTokenExpirationChange" as any);
    sinon.stub(BaseTokenRequestHandler.prototype, "performTokenRequest").callsFake(async (_configuration: AuthorizationServiceConfiguration, _request: TokenRequest) => {
      return mockTokenResponse;
    });

    // Get access token and assert its response equals what mock
    const returnedToken = await client.getAccessToken();
    chai.assert.equal(returnedToken, `bearer ${mockTokenResponse.accessToken}`);
  });
});

describe("ElectronAuthorizationBackend Authority URL Logic", () => {
  beforeEach(()=>{
    sinon.restore();
    sinon.stub(ElectronAuthorizationBackend.prototype, "setupIPCHandlers" as any);
  });

  const config: NativeAppAuthorizationConfiguration = {
    clientId: "testClientId",
    scope: "testScope",
  };
  const testAuthority = "https://test.authority.com";

  it("should use config authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new ElectronAuthorizationBackend({ ...config, issuerUrl: testAuthority });
    chai.expect(client.url).equals(testAuthority);
  });

  it("should use config authority and ignore prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new ElectronAuthorizationBackend({ ...config, issuerUrl: testAuthority });
    chai.expect(client.url).equals("https://test.authority.com");
  });

  it("should use default authority without prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new ElectronAuthorizationBackend(config);
    chai.expect(client.url).equals("https://ims.bentley.com");
  });

  it("should use default authority with prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new ElectronAuthorizationBackend(config);
    chai.expect(client.url).equals("https://prefix-ims.bentley.com");
  });

  it("should reroute dev prefix to qa if on default ", async () => {
    process.env.IMJS_URL_PREFIX = "dev-";
    const client = new ElectronAuthorizationBackend(config);
    chai.expect(client.url).equals("https://qa-ims.bentley.com");
  });
});
