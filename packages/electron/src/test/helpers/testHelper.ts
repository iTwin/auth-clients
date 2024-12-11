import { AuthorizationListener, AuthorizationNotifier, AuthorizationRequest, AuthorizationResponse, AuthorizationServiceConfiguration, BaseTokenRequestHandler, TokenRequest, TokenResponse } from "@openid/appauth";
import { ElectronMainAuthorization, ElectronMainAuthorizationConfiguration } from "../../ElectronMain";
import * as sinon from "sinon"
import { LoopbackWebServer } from "../../main/LoopbackWebServer";
import { ElectronMainAuthorizationRequestHandler } from "../../main/ElectronMainAuthorizationRequestHandler";
import { RefreshTokenStore } from "../../main/TokenStore";

interface ClientConfig {
  clientId?: string;
  scopes?: string;
  redirectUris?: string[];
}

interface SetupMockAuthServerOptions {
  performTokenRequestCb?: () => any
}

export function getConfig({ clientId, scopes, redirectUris }: ClientConfig = {}): ElectronMainAuthorizationConfiguration {
  return {
    clientId: clientId ?? "testClientId",
    scopes: scopes ?? "testScope",
    redirectUris: redirectUris ?? ["testRedirectUri_1", "testRedirectUri_2"]
  };
}

interface GetMockTokenResponseProps {
  access_token?: string;
  refresh_token?: string;
  issued_at?: number;
  expires_in?: string;
}

export function getMockTokenResponse({ access_token, refresh_token, issued_at, expires_in }: GetMockTokenResponseProps = {}): TokenResponse {
  return new TokenResponse(
    {
      access_token: access_token ?? "testAccessTokenSignInTest",
      refresh_token: refresh_token ?? "testRefreshToken",
      issued_at: issued_at ?? (new Date()).getTime() / 1000,
      expires_in: expires_in ?? "60000",
    });
}

export async function setupMockAuthServer(mockTokenResponse: TokenResponse, setupMockAuthServerOptions: SetupMockAuthServerOptions = {}): Promise<sinon.SinonSpy<any[], any>> {
  sinon.stub(LoopbackWebServer, "start").resolves();
  sinon.stub(ElectronMainAuthorizationRequestHandler.prototype, "performAuthorizationRequest").callsFake(async () => {
    await new Promise((resolve) => setImmediate(resolve, () => { }));
  });
  const spy = sinon.fake();
  sinon.stub(ElectronMainAuthorization.prototype, "refreshToken").callsFake(spy);
  sinon.stub(BaseTokenRequestHandler.prototype, "performTokenRequest").callsFake(async (_configuration: AuthorizationServiceConfiguration, _request: TokenRequest) => {
    if (setupMockAuthServerOptions.performTokenRequestCb) {
      await setupMockAuthServerOptions.performTokenRequestCb();
    }
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

  return spy
}

export function stubTokenCrypto(token: string) {
  const encryptSpy = sinon.stub(RefreshTokenStore.prototype, "encryptRefreshToken" as any).returns(Promise.resolve(Buffer.from(token)));
  const decryptSpy = sinon.stub(RefreshTokenStore.prototype, "decryptRefreshToken" as any).returns(Promise.resolve(token));
  return { encryptSpy, decryptSpy }
}