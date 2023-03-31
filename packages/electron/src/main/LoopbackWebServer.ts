/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

/** @packageDocumentation
 * @module Authentication
 */

import * as Http from "http";
import type { AuthorizationErrorJson, AuthorizationResponseJson } from "@openid/appauth";
import type { ElectronAuthorizationEvents } from "./Events";
import { Logger } from "@itwin/core-bentley";
const loggerCategory = "electron-auth";

type StateEventsPair = [string, ElectronAuthorizationEvents];

/** Utility to manage re-entrancy if there are multiple login attempts */
class AuthorizationState {
  private static _stateEventsMap = [] as StateEventsPair[];

  public addState(state: string, authEvents: ElectronAuthorizationEvents): void {
    AuthorizationState._stateEventsMap.push([state, authEvents]);
  }

  public removeState(state: string): void {
    AuthorizationState._stateEventsMap = AuthorizationState._stateEventsMap.filter((se) => se[0] !== state);
  }

  // Get events for a received login response
  public getEvents(state: string): ElectronAuthorizationEvents | null {
    const stateEventsPair = AuthorizationState._stateEventsMap.find((se) => se[0] === state);
    if (stateEventsPair) {
      return stateEventsPair[1];
    }
    return null;
  }
}

/**
 * Web server to listen to authorization requests/responses for the DesktopAuthorizationClient
 * @internal
 */
export class LoopbackWebServer {
  private static _httpServer?: Http.Server;
  private static _authState: AuthorizationState = new AuthorizationState();
  private static _redirectUri: string;

  /** Start a web server to listen to the browser requests */
  public static async start(redirectUri: string): Promise<void> {
    if (LoopbackWebServer._httpServer)
      return;
    this._redirectUri = redirectUri;

    return new Promise((resolve, reject) => {
      const server = Http.createServer(LoopbackWebServer.onBrowserRequest);
      server.on("error", reject);

      const urlParts: URL = new URL(this._redirectUri);
      server.listen(urlParts.port, () => {
        LoopbackWebServer._httpServer = server;
        resolve();
      });
    });
  }

  /** Add to the authorization state so that the correct response data is used for each request */
  public static addCorrelationState(state: string, authEvents: ElectronAuthorizationEvents): void {
    return LoopbackWebServer._authState.addState(state, authEvents);
  }

  /** Stop the web server after the authorization was completed */
  private static stop() {
    if (!LoopbackWebServer._httpServer)
      return;
    LoopbackWebServer._httpServer.close((err) => {
      if (err)
        Logger.logWarning(loggerCategory, "Could not close the loopback server", () => err)
      else
        LoopbackWebServer._httpServer = undefined
    });
    
  }

  /** Listen/Handle browser events */
  private static onBrowserRequest(httpRequest: Http.IncomingMessage, httpResponse: Http.ServerResponse): void {
    if (!httpRequest.url)
      return;

    // Parse the request URL to determine the authorization code, state and errors if any
    const redirectedUrl = new URL(httpRequest.url, LoopbackWebServer._redirectUri);
    const searchParams = redirectedUrl.searchParams;

    const state = searchParams.get("state") || undefined;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    if (!state) {
      // ignore irrelevant requests (e.g. favicon.ico)
      return;
    }

    // Look up context for the corresponding outgoing request
    const authorizationEvents = LoopbackWebServer._authState.getEvents(state);
    if (!authorizationEvents)
      return;

    // Notify listeners of the code response or error
    let authorizationResponse: AuthorizationResponseJson | null = null;
    let authorizationError: AuthorizationErrorJson | null = null;
    if (error) {
      const errorUri = searchParams.get("error_uri") || undefined;
      const errorDescription = searchParams.get("error_description") || undefined;
      authorizationError = { error, error_description: errorDescription, error_uri: errorUri, state }; // eslint-disable-line @typescript-eslint/naming-convention
      httpResponse.write("<h1>Sign in error!</h1>"); // TODO: Needs localization
      httpResponse.end();
    } else {
      authorizationResponse = { code: code!, state };
      httpResponse.writeHead(200, { "Content-Type": "text/html" }); //  eslint-disable-line @typescript-eslint/naming-convention
      httpResponse.write("<h1>Sign in was successful!</h1>You can close this browser window and return to the application"); // TODO: Needs localization
      httpResponse.end();
    }
    authorizationEvents.onAuthorizationResponse.raiseEvent(authorizationError, authorizationResponse);

    // Handle the authorization completed event
    authorizationEvents.onAuthorizationResponseCompleted.addOnce((_authCompletedError?: AuthorizationErrorJson) => {
      // Stop the web server now that the signin attempt has finished
      LoopbackWebServer.stop();
    });
  }
}
