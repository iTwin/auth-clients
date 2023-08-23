import { TokenResponse } from "@openid/appauth";
import { assert, expect, use } from "chai";
import chaiAsPromised = require("chai-as-promised");
import { TokenStore } from "../TokenStore.js";
import { rmSync } from "fs";
import { spy } from "sinon";
use(chaiAsPromised);

describe("TokenStore", () => {
  let tokenStore: TokenStore;
  const testTokenResponse = new TokenResponse({
    access_token: "testAccessToken", // eslint-disable-line @typescript-eslint/naming-convention
    refresh_token: "testRefreshToken", // eslint-disable-line @typescript-eslint/naming-convention
    scope: "scope1 scope2",
  });

  beforeEach(async () => {
    tokenStore = new TokenStore({
      clientId: "testClientId",
      issuerUrl: "https://testUrl.com",
      scopes: "testScope1 testScope2",
    }, `${process.cwd()}/testConfig`);
  });

  afterEach(() => {
    rmSync(`${process.cwd()}/testConfig`, {recursive: true, force: true});
  });

  it("should encrypt cache on save", async () => {
    if (process.platform === "linux")
      return;

    const saveSpy = spy(tokenStore as any, "encryptCache");
    await tokenStore.save(testTokenResponse);
    assert.isTrue(saveSpy.calledOnce);
  });

  it("should decrypt cache on load", async () => {
    if (process.platform === "linux")
      return;

    await tokenStore.save(testTokenResponse);

    const retrievedToken = await tokenStore.load();
    expect(retrievedToken!.refreshToken).equals(testTokenResponse.refreshToken);
  });

  it("load() should return undefined when scopes are mismatched", async () => {
    if (process.platform === "linux")
      return;

    await tokenStore.save(testTokenResponse);

    const tokenStore2 = new TokenStore({
      clientId: "testClientId",
      issuerUrl: "https://testUrl.com",
      scopes: "testScope1 testScope2 testScope3",
    }, `${process.cwd()}/testConfig`);

    const retrievedToken = await tokenStore2.load();
    expect(retrievedToken).to.be.undefined;
  });
});
