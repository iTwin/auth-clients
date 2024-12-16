import type { AuthorizationListener, AuthorizationServiceConfiguration, TokenRequest } from "@openid/appauth";
import { AuthorizationNotifier, AuthorizationRequest, AuthorizationResponse, BaseTokenRequestHandler, TokenResponse } from "@openid/appauth";
import type { ElectronMainAuthorizationConfiguration } from "../../ElectronMain";
import { ElectronMainAuthorization } from "../../main/Client";
import * as sinon from "sinon";
import { LoopbackWebServer } from "../../main/LoopbackWebServer";
import { ElectronMainAuthorizationRequestHandler } from "../../main/ElectronMainAuthorizationRequestHandler";
import { RefreshTokenStore } from "../../main/TokenStore";

interface ClientConfig {
  clientId?: string;
  scopes?: string;
  redirectUris?: string[];
}

interface SetupMockAuthServerOptions {
  performTokenRequestCb?: () => any;
}

/**
 * Get configuration for the test client
 */
export function getConfig({ clientId, scopes, redirectUris }: ClientConfig = {}): ElectronMainAuthorizationConfiguration {
  return {
    clientId: clientId ?? "testClientId",
    scopes: scopes ?? "testScope",
    redirectUris: redirectUris ?? ["testRedirectUri_1", "testRedirectUri_2"],
  };
}

interface GetMockTokenResponseProps {
  accessToken?: string;
  refreshToken?: string;
  issuedAt?: number;
  expiresIn?: string;
}

/**
 * Construct a mock token response
 */
export function getMockTokenResponse({ accessToken, refreshToken, issuedAt, expiresIn }: GetMockTokenResponseProps = {}): TokenResponse {
  return new TokenResponse(
    {
      /* eslint-disable @typescript-eslint/naming-convention */
      access_token: accessToken ?? "testAccessTokenSignInTest",
      refresh_token: refreshToken ?? "testRefreshToken",
      issued_at: issuedAt ?? (new Date()).getTime() / 1000,
      expires_in: expiresIn ?? "60000",
      /* eslint-disable @typescript-eslint/naming-convention */
    });
}

/**
 * Setup a mock auth server and listen for refresh token calls
 * @returns a spy which can be used to make assertions on the refresh token call
 */
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
      /* eslint-disable @typescript-eslint/naming-convention */
      response_type: "testResponseType",
      client_id: "testClient",
      redirect_uri: "testRedirect",
      scope: "testScope",
      internal: { code_verifier: "testCodeVerifier" },
      state: "testState",
      /* eslint-disable @typescript-eslint/naming-convention */
    });

    const authResponse = new AuthorizationResponse({ code: "testCode", state: "testState" });
    listener(authRequest, authResponse, null);
  });

  return spy;
}

/**
 * Convenience function to stub the token encryption/decryption methods
 */
export function stubTokenCrypto(token: string) {
  const encryptSpy = sinon.stub(RefreshTokenStore.prototype, "encryptRefreshToken" as any).returns(Promise.resolve(Buffer.from(token)));
  const decryptSpy = sinon.stub(RefreshTokenStore.prototype, "decryptRefreshToken" as any).returns(Promise.resolve(token));
  return { encryptSpy, decryptSpy };
}
