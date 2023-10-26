/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import type {
  TestUserCredentials,
} from "./TestUsers";
import * as SignInAutomation from "./SignInAutomation";
import { ElectronMainAuthorization, ElectronMainAuthorizationConfiguration } from "@itwin/electron-authorization/lib/cjs/ElectronMain";
import { LoopbackWebServer } from "@itwin/electron-authorization/lib/cjs/main/LoopbackWebServer";

/**
 * @see exportedTestElectronAuthorizationClient
 */
class TestElectronAuthorizationClient extends ElectronMainAuthorization {
  private readonly _user: TestUserCredentials;

  public constructor(
    config: ElectronMainAuthorizationConfiguration,
    user: TestUserCredentials
  ) {
    super(config);
    this._user = user;
  }


  public override async signIn(): Promise<void> {
    const config = await this._discoveryClient.getConfig();

    // eslint-disable-next-line no-console
    console.log(`Starting OIDC signin for ${this._user.email} ...`);

    // this is only async because it _could_ use AsyncStorage browser API.
    // We replaced it with InMemoryWebStorage so everything is synchronous under the hood.
    const signInRequest = await oidcClient.createSigninRequest({
      request_type: "si:r",
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    const page = await SignInAutomation.launchDefaultAutomationPage();

    // FIXME: add protected method to ElectronMainAuthorization
    const waitForCallbackUrl = (async () => {
      // Start an HTTP server to listen for browser requests. Due to possible port collisions, iterate over given
      // redirectUris until we successfully bind the HTTP listener to a port.
      let redirectUri = "";

      for (const tryRedirectUri of this._redirectUris) {
        try {
          await LoopbackWebServer.start(tryRedirectUri);
          redirectUri = tryRedirectUri;
          break;
        } catch (e: unknown) {
          // Most common error is EADDRINUSE (port already in use) - just continue with the next port
          continue;
        }
      }

      if (redirectUri === "") {
        throw new Error(
          `Failed to start an HTTP server with given redirect URIs, [${this._redirectUris.toString()}]`
        );
      }

      return redirectUri;
    })();

    const result = await SignInAutomation.automatedSignIn({
      page,
      signInInitUrl: signInRequest.url,
      user: this._user,
      clientConfig: this._configuration,
      oidcConfig: await this._discoveryClient.getConfig(),
      waitForCallbackUrl,
      resultFromCallbackUrl: async (callbackUrl) => {
        const tokenSet = await oidcClient.processSigninResponse(callbackUrl);

        return {
          accessToken: `Bearer ${tokenSet.access_token}`,
          expiresAt: tokenSet.expires_at !== undefined
            ? new Date(tokenSet.expires_at * 1000)
            : undefined,
        };
      },
    });

    this._accessToken = result.accessToken;
    this._expiresAt = result.expiresAt;
  }
}

/** import the optional electron dependency and make sure we're in the main process */
const tryImportElectronInMainProcess = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    if (typeof electron === "string")
      throw Error("not in main process");
    return electron;
  } catch {
    return undefined;
  }
};

/**
 * Implementation of AuthorizationClient used for the iModel.js desktop integration tests.
 * - this is only to be used in test environments, and **never** in production code.
 * - calling getAccessToken() the first time, or after token expiry, causes the authorization to happen by
 *   spawning a headless browser, and automatically filling in the supplied user credentials.
 * @alpha
 */
const exportedTestElectronAuthorizationClient = tryImportElectronInMainProcess() !== undefined
  ? TestElectronAuthorizationClient
  : Error(
    "electron could not be found."
    + " This export is conditional upon the optional dependencies of"
    + " electron and @itwin/electron-authorization"
  );

export { exportedTestElectronAuthorizationClient as TestElectronAuthorizationClient };
