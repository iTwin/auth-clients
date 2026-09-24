/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { generateKeyPairSync } from "crypto";
import { Logger } from "@itwin/core-bentley";
import { use as chaiUse, expect } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as jwt from "jsonwebtoken";
import * as jwks from "jwks-rsa";
import * as sinon from "sinon";
import { IntrospectionClient } from "../introspection/IntrospectionClient";
import type { OIDCConfig } from "../OIDCDiscoveryClient";
import { OIDCDiscoveryClient } from "../OIDCDiscoveryClient";
chaiUse(chaiAsPromised);

function generateSigningKey(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" };
  const sign = () => jwt.sign(
    { scope: ["scope1"] },
    privateKeyPem,
    { algorithm: "RS256", keyid: kid, expiresIn: "1h" },
  );
  return { jwk, sign };
}

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

  it("should configure a bounded, rate-limited JWKS cache", async () => {
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
    } as OIDCConfig);

    const client = new IntrospectionClient();
    const jwksClient = await client["getJwks"]() as unknown as { options: jwks.Options };

    expect(jwksClient.options.cache).to.be.true;
    expect(jwksClient.options.cacheMaxAge).to.equal(10 * 60 * 1000);
    expect(jwksClient.options.rateLimit).to.be.true;
    expect(jwksClient.options.jwksRequestsPerMinute).to.equal(10);
  });

  it("should stop trusting a signing key once the issuer removes it and the cache expires", async () => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
    } as OIDCConfig);
    sinon.stub(Logger, "logError");

    const retiredKey = generateSigningKey("retired-key");
    const currentKey = generateSigningKey("current-key");
    const getKeysStub = sinon.stub(jwks.JwksClient.prototype, "getKeys");
    getKeysStub.resolves([retiredKey.jwk]);

    const client = new IntrospectionClient();
    const tokenBeforeRemoval = retiredKey.sign();
    expect((await client.introspect(`Bearer ${tokenBeforeRemoval}`)).active).to.be.true;

    // The issuer removes the retired key from its JWKS.
    getKeysStub.resolves([currentKey.jwk]);

    // An attacker who holds the retired private key mints a new token.
    const tokenAfterRemoval = retiredKey.sign();

    // Trust in the cached key lasts only until its cache entry expires.
    clock.tick(10 * 60 * 1000 + 1);
    await expect(client.introspect(`Bearer ${tokenAfterRemoval}`))
      .to.be.rejectedWith(jwks.SigningKeyNotFoundError);

    // Tokens signed with the current key are still accepted.
    expect((await client.introspect(`Bearer ${currentKey.sign()}`)).active).to.be.true;
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
