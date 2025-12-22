/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ElectronRendererAuthorization } from "../renderer/Client";
import * as chai from "chai";
import * as sinon from "sinon";

const expect = chai.expect;

describe("ElectronRendererAuthorization ipcChannelEnvPrefix", () => {
  const channelPrefix = `itwin.electron.auth`;
  const channelNames = [
    "signIn",
    "signOut",
    "getAccessToken",
    "onAccessTokenChanged",
    "onAccessTokenExpirationChanged",
    "signInSilent",
  ] as const;

  it("should use prefixed IPC channel names when ipcChannelEnvPrefix is provided", () => {
    const clientId = "test-client";
    const prefix = "customenv";
    const config = {
      clientId,
      ipcChannelEnvPrefix: prefix,
      ipcSocket: createMockIpcSocket(),
    };
    const authClient = new ElectronRendererAuthorization(config);
    channelNames.forEach((name) => {
      expect(authClient["_ipcAuthAPI"]["_ipcChannelNames"][name]).to.eq(
        `${channelPrefix}.${name}-${prefix}-${clientId}`
      );
    });
  });

  it("should use default IPC channel names when ipcChannelEnvPrefix is not provided", () => {
    const clientId = "test-client";
    const config = {
      clientId,
      ipcSocket: createMockIpcSocket(),
    };
    const authClient = new ElectronRendererAuthorization(config);
    channelNames.forEach((name) => {
      expect(authClient["_ipcAuthAPI"]["_ipcChannelNames"][name]).to.eq(
        `${channelPrefix}.${name}-${clientId}`
      );
    });
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
