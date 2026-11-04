/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as Http from "http";
import type { AddressInfo } from "net";
import type { AuthorizationResponseJson } from "@openid/appauth";
import * as chai from "chai";
import { ElectronAuthorizationEvents } from "../main/Events.js";
import { LoopbackWebServer } from "../main/LoopbackWebServer.js";

const expect = chai.expect;

async function getFreePort(): Promise<number> {
  const server = Http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** Sends a request through the default agent, which keeps the connection alive afterwards. */
async function get(url: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    Http.get(url, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    }).on("error", reject);
  });
}

describe("LoopbackWebServer", () => {
  let redirectUri: string;
  let stateCount = 0;

  /** Registers a sign in attempt and returns the redirect URL the browser would be sent to. */
  function addSignIn(): { url: string, events: ElectronAuthorizationEvents } {
    const state = `state${++stateCount}`;
    const events = new ElectronAuthorizationEvents();
    LoopbackWebServer.addCorrelationState(state, events);
    return { url: `${redirectUri}?state=${state}&code=testCode`, events };
  }

  beforeEach(async () => {
    redirectUri = `http://localhost:${await getFreePort()}/signin-callback`;
  });

  afterEach(async () => {
    const server = LoopbackWebServer as any;
    server.stop();
    await server._closing;
  });

  it("listens again when a sign in starts right after the previous one completed", async () => {
    await LoopbackWebServer.start(redirectUri);
    const first = addSignIn();
    expect(await get(first.url)).to.equal(200);
    first.events.onAuthorizationResponseCompleted.raiseEvent();

    // The previous server is still closing at this point.
    await LoopbackWebServer.start(redirectUri);
    const second = addSignIn();
    let response: AuthorizationResponseJson | null = null;
    second.events.onAuthorizationResponse.addOnce((_error, authResponse) => response = authResponse);
    expect(await get(second.url)).to.equal(200);
    expect(response).to.deep.equal({ code: "testCode", state: `state${stateCount}` });
  });

  it("responds to requests that are not a sign in redirect", async () => {
    await LoopbackWebServer.start(redirectUri);
    expect(await get(new URL("/favicon.ico", redirectUri).href)).to.equal(404);
    expect(await get(`${redirectUri}?state=unknown&code=testCode`)).to.equal(404);
  });
});
