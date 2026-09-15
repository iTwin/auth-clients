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

  function setup(getAccessTokenResult: string = "backend token") {
    const listeners = new Map<string, (event: any, ...args: any[]) => void>();
    const invoke = sinon.stub();
    invoke.callsFake(async (channel: string) => {
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
    sinon.assert.calledOnce(invoke);
    expect(invoke.firstCall.args[0]).to.contain("getAccessToken");
    expect(token).to.eq("backend token");
  });

  it("should return the cached token without pulling when expiry is in the future", async () => {
    const { authClient, invoke, raise } = setup();

    raise("onAccessTokenChanged", "cached token");
    raise("onAccessTokenExpirationChanged", new Date(Date.now() + 60 * 60 * 1000));

    expect(authClient.isAuthorized).to.eq(true);
    const token = await authClient.getAccessToken();
    sinon.assert.notCalled(invoke);
    expect(token).to.eq("cached token");
  });

  it("should pull a fresh token when the cached token is within the expiry buffer", async () => {
    const { authClient, invoke, raise } = setup("backend token");

    raise("onAccessTokenChanged", "cached token");
    // Expires in 1 second - well within the default expiry buffer.
    raise("onAccessTokenExpirationChanged", new Date(Date.now() + 1000));

    expect(authClient.isAuthorized).to.eq(false);
    const token = await authClient.getAccessToken();
    sinon.assert.calledOnce(invoke);
    expect(token).to.eq("backend token");
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
