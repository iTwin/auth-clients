/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { Guid, Logger } from "@itwin/core-bentley";
import { assert, use as chaiUse, expect } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as jwt from "jsonwebtoken";
import * as jwks from "jwks-rsa";
import { Issuer, Client as OpenIdClient } from "openid-client";
import * as sinon from "sinon";
import { IntrospectionClient } from "../introspection/IntrospectionClient";
chaiUse(chaiAsPromised);

describe("IntrospectionClient", () => {
  afterEach(() => {
    sinon.restore();
  });

  const testAuthority = "https://test.authority.com";
  it("should use config authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new IntrospectionClient({ issuerUrl: testAuthority });
    expect(client.url).equals(testAuthority);
  });

  it("should use config authority and ignore prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new IntrospectionClient({ issuerUrl: testAuthority });
    expect(client.url).equals("https://test.authority.com");
  });

  it("should use default authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new IntrospectionClient();
    expect(client.url).equals("https://ims.bentley.com");
  });

  it("should use default authority with prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new IntrospectionClient();
    expect(client.url).equals("https://prefix-ims.bentley.com");
  });

  it("should reroute dev prefix to qa if on default ", async () => {
    process.env.IMJS_URL_PREFIX = "dev-";
    const client = new IntrospectionClient();
    expect(client.url).equals("https://qa-ims.bentley.com");
  });

  it("should throw if issuer does not support JWKS", async () => {
    sinon.stub(Issuer, "discover").resolves({ metadata: {} } as Issuer<OpenIdClient>);
    const logStub = sinon.stub(Logger, "logError");
    sinon.stub(jwt, "decode").returns({
      header: {},
    });

    const client = new IntrospectionClient();
    await expect(client.introspect("fake token")).to.be.rejectedWith("Issuer does not support JWKS");

    expect(logStub.callCount).to.be.equal(2);
    expect(logStub.firstCall.args[1]).to.equal("Issuer does not support JWKS");
    expect(logStub.secondCall.args[1]).to.equal("Unable to introspect client token");
  });

  it("should throw if token is not a JWT", async () => {
    const logStub = sinon.stub(Logger, "logError");

    const client = new IntrospectionClient();
    await expect(client.introspect("not a JWT")).to.be.rejectedWith("Failed to decode JWT");

    expect(logStub.callCount).to.equal(1);
    expect(logStub.firstCall.args[1]).to.equal("Unable to introspect client token");
    expect(logStub.firstCall.lastArg().message).to.equal("Error: Failed to decode JWT");
  });

  it("should throw if scope claim is missing", async () => {
    sinon.stub(Issuer, "discover").resolves({
      metadata: {
        jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
      },
    } as Issuer<OpenIdClient>);
    const logStub = sinon.stub(Logger, "logError");
    sinon.stub(jwt, "decode").returns({
      header: {},
    });
    sinon.stub(jwks.JwksClient.prototype, "getSigningKey").resolves({
      getPublicKey: () => "fake key",
    });
    sinon.stub(jwt, "verify").returns({} as any);

    const client = new IntrospectionClient();
    await expect(client.introspect("fake token")).to.be.rejectedWith("Missing scope in JWT");

    expect(logStub.callCount).to.equal(1);
    expect(logStub.firstCall.args[1]).to.equal("Unable to introspect client token");
    expect(logStub.firstCall.lastArg().message).to.equal("Error: Missing scope in JWT");
  });

  it("should throw if scope claim is invalid", async () => {
    sinon.stub(Issuer, "discover").resolves({
      metadata: {
        jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
      },
    } as Issuer<OpenIdClient>);
    const logStub = sinon.stub(Logger, "logError");
    sinon.stub(jwt, "decode").returns({
      header: {},
    });
    sinon.stub(jwks.JwksClient.prototype, "getSigningKey").resolves({
      getPublicKey: () => "fake key",
    });
    sinon.stub(jwt, "verify").returns({ scope: [1, 2, 3] } as any);

    const client = new IntrospectionClient();
    await expect(client.introspect("fake token")).to.be.rejectedWith("Invalid scope");

    expect(logStub.callCount).to.equal(1);
    expect(logStub.firstCall.args[1]).to.equal("Unable to introspect client token");
    expect(logStub.firstCall.lastArg().message).to.equal("Error: Invalid scope");
  });

  it("should cache signing key", async () => {
    const fakeKey1 = { getPublicKey: () => "fake key 1" };
    const fakeKey2 = { getPublicKey: () => "fake key 2" };
    sinon.stub(jwt, "decode")
      .onFirstCall().returns({ header: { kid: "kid1" } })
      .onSecondCall().returns({ header: { kid: "kid2" } })
      .onThirdCall().returns({ header: { kid: "kid2" } })
      .returns({ header: {} });

    const keyStub = sinon.stub(jwks.JwksClient.prototype, "getSigningKey").callsFake(async (kid) => {
      if (kid === "kid1") return fakeKey1;
      if (kid === "kid2") return fakeKey2;
      if (kid === undefined) return { a: Guid.createValue(), getPublicKey: () => `fake key - ${Guid.createValue()}` };
      assert.fail("unexpected key id");
    });

    sinon.stub(jwt, "verify").returns({ scope: ["scope1", "scope2"] } as any);

    const client = new IntrospectionClient();

    // call with kid1 - added to cache
    await client.introspect("fake token 1");
    expect(client["_signingKeyCache"].size).to.equal(1);
    expect(client["_signingKeyCache"].has("kid1")).to.be.true;
    expect(client["_signingKeyCache"].get("kid1")).to.equal(fakeKey1);
    expect(keyStub.callCount).to.equal(1);
    expect(keyStub.lastCall.firstArg).to.equal("kid1");

    // this is ugly, but not remotely as ugly as the spaghetti monster that hides inside jwks-rsa.
    client["_jwks"]!.getSigningKey = jwks.JwksClient.prototype.getSigningKey.bind(client["_jwks"]);

    // call with kid2 - added to cache
    await client.introspect("fake token 2");
    expect(client["_signingKeyCache"].size).to.equal(2);
    expect(client["_signingKeyCache"].has("kid2")).to.be.true;
    expect(client["_signingKeyCache"].get("kid2")).to.equal(fakeKey2);
    expect(keyStub.callCount).to.equal(2);
    expect(keyStub.lastCall.firstArg).to.equal("kid2");

    // call with kid2 - already in cache, nothing changes
    await client.introspect("fake token 3");
    expect(client["_signingKeyCache"].size).to.equal(2);
    expect(keyStub.callCount).to.equal(2);

    // call without kid - new key retrieved, cache not affected
    await client.introspect("fake token 4");
    expect(client["_signingKeyCache"].size).to.equal(2);
    expect(keyStub.callCount).to.equal(3);
    expect(keyStub.lastCall.firstArg).to.be.undefined;

    // call without kid - new key retrieved, cache not affected
    await client.introspect("fake-token-5");
    expect(client["_signingKeyCache"].size).to.equal(2);
    expect(keyStub.callCount).to.equal(4);
    expect(keyStub.lastCall.firstArg).to.be.undefined;
  });
});
