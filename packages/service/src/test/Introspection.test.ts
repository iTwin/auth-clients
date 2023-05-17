/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/dot-notation */

import { Logger } from "@itwin/core-bentley";
import { assert, use as chaiUse, expect } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as jwt from "jsonwebtoken";
import * as jwks from "jwks-rsa";
import * as sinon from "sinon";
import { IntrospectionClient } from "../introspection/IntrospectionClient";
import type { OIDCConfig } from "../OIDCDiscoveryClient";
import { OIDCDiscoveryClient } from "../OIDCDiscoveryClient";
chaiUse(chaiAsPromised);

describe("IntrospectionClient", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should throw if issuer does not support JWKS", async () => {
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({} as OIDCConfig);
    const logStub = sinon.stub(Logger, "logError");

    const token = jwt.sign({ scope: ["scope1", "scope2"] }, "very secret");

    const client = new IntrospectionClient();
    await expect(client.introspect(`fake ${token}`)).to.be.rejectedWith("Issuer does not support JWKS");

    expect(logStub.callCount).to.be.equal(2);
    expect(logStub.firstCall.args[1]).to.equal("Issuer does not support JWKS");
    expect(logStub.secondCall.args[1]).to.equal("Unable to introspect client token");
  });

  it("should throw if token is not a JWT", async () => {
    const client = new IntrospectionClient();
    await expect(client.introspect("not a JWT")).to.be.rejectedWith("Failed to decode JWT");
  });

  it("should throw if scope claim is missing", async () => {
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
    } as OIDCConfig);
    const logStub = sinon.stub(Logger, "logError");
    sinon.stub(jwks.JwksClient.prototype, "getSigningKey").resolves({
      getPublicKey: () => "fake key",
    });
    sinon.stub(jwt, "verify");

    const token = jwt.sign({}, "very secret");

    const client = new IntrospectionClient();
    await expect(client.introspect(`fake ${token}`)).to.be.rejectedWith("Missing scope in JWT");

    expect(logStub.callCount).to.equal(1);
    expect(logStub.firstCall.args[1]).to.equal("Unable to introspect client token");
    expect(logStub.firstCall.lastArg().message).to.equal("Error: Missing scope in JWT");
  });

  it("should throw if scope claim is invalid", async () => {
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
    } as OIDCConfig);
    const logStub = sinon.stub(Logger, "logError");
    sinon.stub(jwks.JwksClient.prototype, "getSigningKey").resolves({
      getPublicKey: () => "fake key",
    });
    sinon.stub(jwt, "verify");

    const token = jwt.sign({ scope: [1, 2, 3] }, "very secret");

    const client = new IntrospectionClient();
    await expect(client.introspect(`fake ${token}`)).to.be.rejectedWith("Invalid scope");

    expect(logStub.callCount).to.equal(1);
    expect(logStub.firstCall.args[1]).to.equal("Unable to introspect client token");
    expect(logStub.firstCall.lastArg().message).to.equal("Error: Invalid scope");
  });

  it("should cache signing key", async () => {
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
    } as OIDCConfig);
    const fakeKey1 = { getPublicKey: () => "fake key1" };
    const fakeKey2 = { getPublicKey: () => "fake key2" };
    const payload = { scope: ["scope1", "scope2"] };

    const keyStub = sinon.stub(jwks.JwksClient.prototype, "getSigningKey").callsFake(async (kid) => {
      if (kid === "kid1")
        return fakeKey1;
      if (kid === "kid2")
        return fakeKey2;
      if (kid === undefined)
        return { getPublicKey: () => "fake key" };
      assert.fail("unexpected key id");
    });

    sinon.stub(jwt, "verify");

    const token1 = jwt.sign(payload, "very secret", { header: { kid: "kid1", alg: "none" } });
    const token2 = jwt.sign(payload, "very secret", { header: { kid: "kid2", alg: "none" } });
    const token3 = jwt.sign(payload, "very secret", { header: { kid: "kid2", alg: "none" } });
    const token4 = jwt.sign(payload, "very secret");
    const token5 = jwt.sign(payload, "very secret");

    const client = new IntrospectionClient();

    // call with kid1 - added to cache
    await client.introspect(`fake ${token1}`);
    expect(client["_signingKeyCache"].size).to.equal(1);
    expect(client["_signingKeyCache"].has("kid1")).to.be.true;
    expect(client["_signingKeyCache"].get("kid1")).to.equal(fakeKey1);
    expect(keyStub.callCount).to.equal(1);
    expect(keyStub.lastCall.firstArg).to.equal("kid1");

    // this is ugly, but not remotely as ugly as the spaghetti monster that hides inside jwks-rsa. I'm fighting fire with fire here.
    client["_jwks"]!.getSigningKey = jwks.JwksClient.prototype.getSigningKey.bind(client["_jwks"]);

    // call with kid2 - added to cache
    await client.introspect(`fake ${token2}`);
    expect(client["_signingKeyCache"].size).to.equal(2);
    expect(client["_signingKeyCache"].has("kid2")).to.be.true;
    expect(client["_signingKeyCache"].get("kid2")).to.equal(fakeKey2);
    expect(keyStub.callCount).to.equal(2);
    expect(keyStub.lastCall.firstArg).to.equal("kid2");

    // call with kid2 - already in cache, nothing changes
    await client.introspect(`fake ${token3}`);
    expect(client["_signingKeyCache"].size).to.equal(2);
    expect(keyStub.callCount).to.equal(2);

    // call without kid - new key retrieved, cache not affected
    await client.introspect(`fake ${token4}`);
    expect(client["_signingKeyCache"].size).to.equal(2);
    expect(keyStub.callCount).to.equal(3);
    expect(keyStub.lastCall.firstArg).to.be.undefined;

    // call without kid - new key retrieved, cache not affected
    await client.introspect(`fake ${token5}`);
    expect(client["_signingKeyCache"].size).to.equal(2);
    expect(keyStub.callCount).to.equal(4);
    expect(keyStub.lastCall.firstArg).to.be.undefined;
  });

  it("should return active:false if token is expired", async () => {
    // this token expired in 2018
    const token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwic2NvcGUiOlsic2NvcGUxIiwic2NvcGUyIl0sImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoxNTE2MjQyNjIyfQ.YZAIAcRq6vwTB3jjAMQogxfRzwDv4RoKzqaKlzFucNg";
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
    } as OIDCConfig);
    sinon.stub(jwks.JwksClient.prototype, "getSigningKey").resolves({
      getPublicKey: () => ")H@McQfThWmZq4t7w!z%C*F-JaNdRgUk",
    });
    const client = new IntrospectionClient();
    const response = await client.introspect(token);
    expect(response.active).to.be.false;
    expect(response.scope).to.equal("scope1 scope2");
  });

  it("should return active:true if token is not expired", async () => {
    // this token will expire on Wed Apr 01 2303 21:30:22 GMT+0300
    const token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwic2NvcGUiOlsic2NvcGUxIiwic2NvcGUyIl0sImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoxMDUxNjI0MjYyMn0.yYZvLAlx2zwTufGHsTg4GeOlWe35XTWfHeR8W_gTwzM";
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
    } as OIDCConfig);
    sinon.stub(jwks.JwksClient.prototype, "getSigningKey").resolves({
      getPublicKey: () => ")H@McQfThWmZq4t7w!z%C*F-JaNdRgUk",
    });
    const client = new IntrospectionClient();
    const response = await client.introspect(token);
    expect(response.active).to.be.true;
    expect(response.scope).to.equal("scope1 scope2");
  });
});
