/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
// Code based on the blog article @ https://authguidance.com

import * as Http from "http";
import * as path from "path";
import { readFileSync } from "fs";
import type { AuthorizationErrorJson, AuthorizationResponseJson } from "@openid/appauth";
import type { ElectronAuthorizationEvents } from "./Events.js";
import { assert, Logger } from "@itwin/core-bentley";
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

interface HtmlTemplateParams {
  pageTitle: string;
  contentTitle: string;
  contentMessage: string;
}

interface OidcUrlSearchParams {
  state: string | null;
  code: string | null;
  error: string | null;
  errorUri: string | null;
  errorDescription: string | null;
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
  public static async start(this: void, redirectUri: string): Promise<void> {
    if (LoopbackWebServer._httpServer)
      return;
    LoopbackWebServer._redirectUri = redirectUri;

    return new Promise((resolve, reject) => {
      const server = Http.createServer(LoopbackWebServer.onBrowserRequest);
      server.on("error", reject);

      const urlParts: URL = new URL(LoopbackWebServer._redirectUri);
      const portNumber = Number(urlParts.port);

      server.listen(portNumber, urlParts.hostname, () => {
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
        Logger.logWarning(loggerCategory, "Could not close the loopback server", () => err);
      else
        LoopbackWebServer._httpServer = undefined;
    });
  }

  /** Listen/Handle browser events */
  private static onBrowserRequest(this: void, httpRequest: Http.IncomingMessage, httpResponse: Http.ServerResponse): void {
    if (!httpRequest.url)
      return;

    const { state, code, error, errorUri, errorDescription } = LoopbackWebServer.parseUrlSearchParams(httpRequest.url);

    // ignore irrelevant requests (e.g. favicon.ico)
    if (!state)
      return;

    // Look up context for the corresponding outgoing request
    const authorizationEvents = LoopbackWebServer._authState.getEvents(state);
    if (!authorizationEvents)
      return;

    // Notify listeners of the code response or error
    let authorizationResponse: AuthorizationResponseJson | null = null;
    let authorizationError: AuthorizationErrorJson | null = null;
    let httpResponseContent: HtmlTemplateParams;

    httpResponse.writeHead(200, { "Content-Type": "text/html" }); //  eslint-disable-line @typescript-eslint/naming-convention

    if (error) {
      authorizationError = { error, error_description: errorDescription ?? undefined, error_uri: errorUri ?? undefined, state }; // eslint-disable-line @typescript-eslint/naming-convention
      httpResponseContent = {
        pageTitle: "iTwin Auth Sign in error",
        contentTitle: "Sign in Error",
        contentMessage: "Please check your application's error console.",
      };
      // TODO: Needs localization
    } else {
      assert(!!code, "Auth response code is not present");
      authorizationResponse = { code, state };
      httpResponseContent = {
        pageTitle: "iTwin Auth - Sign in successful",
        contentTitle: "Sign in was successful!",
        contentMessage: "You can close this browser window and return to the application.",
      };
    }

    const html = LoopbackWebServer.getHtmlTemplate(
      httpResponseContent,
    );

    httpResponse.write(html);
    httpResponse.end();
    authorizationEvents.onAuthorizationResponse.raiseEvent(authorizationError, authorizationResponse);

    authorizationEvents.onAuthorizationResponseCompleted.addOnce((_authCompletedError?: AuthorizationErrorJson) => {
      // Stop the web server now that the signin attempt has finished
      LoopbackWebServer.stop();
    });
  }

  private static parseUrlSearchParams(url: string): OidcUrlSearchParams {
    // Parse the request URL to determine the authorization code, state and errors if any
    const redirectedUrl = new URL(url, LoopbackWebServer._redirectUri);
    const searchParams = redirectedUrl.searchParams;

    const state = searchParams.get("state");
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorUri = searchParams.get("error_uri");
    const errorDescription = searchParams.get("error_description");

    return {
      state, code, error, errorUri, errorDescription,
    };
  }

  private static getHtmlTemplate({ pageTitle, contentTitle, contentMessage }: HtmlTemplateParams): string {
    let template = readFileSync(path.resolve(__filename, "..", "static", "auth-template.html"), "utf-8");
    template = template.replace("{--pageTitle--}", pageTitle);
    template = template.replace("{--contentTitle--}", contentTitle);
    template = template.replace("{--contentMessage--}", contentMessage);

    return template;
  }
}
