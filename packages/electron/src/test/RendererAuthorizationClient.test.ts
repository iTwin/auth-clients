/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ElectronRendererAuthorization } from "../renderer/Client.js";
import * as chai from "chai";
import * as sinon from "sinon";

const expect = chai.expect;

describe("ElectronRendererAuthorization channelClientPrefix", () => {
  const channelPrefix = `itwin.electron.auth`;
  const channelNames = [
    "signIn",
    "signOut",
    "getAccessToken",
    "getAccessTokenExpiry",
    "onAccessTokenChanged",
    "onAccessTokenExpirationChanged",
    "signInSilent",
  ] as const;

  it("should use prefixed IPC channel names when channelClientPrefix is provided", () => {
    const clientId = "test-client";
    const prefix = "customenv";
    const config = {
      clientId,
      channelClientPrefix: prefix,
      ipcSocket: createMockIpcSocket(),
    };
    const authClient = new ElectronRendererAuthorization(config);
    channelNames.forEach((name) => {
      /* eslint-disable-next-line @typescript-eslint/dot-notation */
      expect(authClient["_ipcAuthAPI"]["_ipcChannelNames"][name]).to.eq(
        `${channelPrefix}.${name}-${prefix}-${clientId}`,
      );
    });
  });

  it("should use default IPC channel names when channelClientPrefix is not provided", () => {
    const clientId = "test-client";
    const config = {
      clientId,
      ipcSocket: createMockIpcSocket(),
    };
    const authClient = new ElectronRendererAuthorization(config);
    channelNames.forEach((name) => {
      /* eslint-disable-next-line @typescript-eslint/dot-notation */
      expect(authClient["_ipcAuthAPI"]["_ipcChannelNames"][name]).to.eq(
        `${channelPrefix}.${name}-${clientId}`,
      );
    });
  });
});

describe("ElectronRendererAuthorization token expiry", () => {
  const clientId = "test-client";

  /** Counts only token pulls, ignoring the startup expiry bootstrap invoke. */
  function tokenPullCount(invoke: sinon.SinonStub): number {
    return invoke.getCalls().filter((call) => (call.args[0] as string).includes("getAccessToken-")).length;
  }

  /** Lets the startup expiry bootstrap invoke (and its `.then`) settle. */
  async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function setup(getAccessTokenResult: string = "backend token", expiryResult?: Date) {
    const listeners = new Map<string, (event: any, ...args: any[]) => void>();
    const invoke = sinon.stub();
    invoke.callsFake(async (channel: string) => {
      if (channel.includes("getAccessTokenExpiry"))
        return expiryResult;
      if (channel.includes("getAccessToken"))
        return getAccessTokenResult;
      return undefined;
    });
    const ipcSocket = {
      invoke,
      send: sinon.stub(),
      addListener: sinon.stub().callsFake((channel: string, cb: (event: any, ...args: any[]) => void) => {
        listeners.set(channel, cb);
      }),
      removeListener: sinon.stub(),
    };
    const authClient = new ElectronRendererAuthorization({ clientId, ipcSocket });

    const raise = (nameFragment: string, ...args: any[]) => {
      for (const [channel, cb] of listeners) {
        if (channel.includes(nameFragment)) {
          cb({}, ...args);
          return;
        }
      }
      throw new Error(`No listener registered for ${nameFragment}`);
    };

    return { authClient, invoke, raise };
  }

  it("should pull a fresh token when the cached token has an unknown expiry", async () => {
    const { authClient, invoke, raise } = setup("backend token");

    // Simulate the renderer receiving a token push but missing the expiry push.
    raise("onAccessTokenChanged", "cached token");
    expect(authClient.hasSignedIn).to.eq(true);
    // Unknown expiry must be treated as expired so we pull instead of trusting forever.
    expect(authClient.isAuthorized).to.eq(false);

    const token = await authClient.getAccessToken();
    expect(tokenPullCount(invoke)).to.eq(1);
    expect(token).to.eq("backend token");
  });

  it("should return the cached token without pulling when expiry is in the future", async () => {
    const { authClient, invoke, raise } = setup();

    raise("onAccessTokenChanged", "cached token");
    raise("onAccessTokenExpirationChanged", new Date(Date.now() + 60 * 60 * 1000));

    expect(authClient.isAuthorized).to.eq(true);
    const token = await authClient.getAccessToken();
    expect(tokenPullCount(invoke)).to.eq(0);
    expect(token).to.eq("cached token");
  });

  it("should pull a fresh token when the cached token is within the expiry buffer", async () => {
    const { authClient, invoke, raise } = setup("backend token");

    raise("onAccessTokenChanged", "cached token");
    // Expires in 1 second - well within the default expiry buffer.
    raise("onAccessTokenExpirationChanged", new Date(Date.now() + 1000));

    expect(authClient.isAuthorized).to.eq(false);
    const token = await authClient.getAccessToken();
    expect(tokenPullCount(invoke)).to.eq(1);
    expect(token).to.eq("backend token");
  });

  it("should bootstrap the current expiry on startup so a valid token is trusted without pulling", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    // The main process signed in before this renderer existed, so only the request/response
    // bootstrap - not the missed broadcast - can deliver the expiry.
    const { authClient, invoke, raise } = setup("backend token", future);

    // A token arrives (e.g. via a later change broadcast) but the expiry broadcast was missed.
    raise("onAccessTokenChanged", "cached token");
    await flushMicrotasks();

    expect(authClient.isAuthorized).to.eq(true);
    const token = await authClient.getAccessToken();
    expect(tokenPullCount(invoke)).to.eq(0);
    expect(token).to.eq("cached token");
  });

  it("should not overwrite an expiry delivered by broadcast with the startup bootstrap value", async () => {
    const stale = new Date(Date.now() + 1000);
    const fresh = new Date(Date.now() + 60 * 60 * 1000);
    const { authClient, raise } = setup("backend token", stale);

    // A fresh expiry arrives by broadcast before the bootstrap invoke resolves.
    raise("onAccessTokenChanged", "cached token");
    raise("onAccessTokenExpirationChanged", fresh);
    await flushMicrotasks();

    // The broadcast value must win; the older bootstrapped expiry must not clobber it.
    expect(authClient.isAuthorized).to.eq(true);
  });
});

function createMockIpcSocket() {
  return {
    invoke: sinon.stub().resolves(),
    send: sinon.stub(),
    addListener: sinon.stub(),
    removeListener: sinon.stub(),
  };
}
