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

const issuer = "https://ims.example.com";

function generateSigningKey(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" };
  // Claims set to undefined are left out of the token.
  const sign = (claims: object = {}) => jwt.sign(
    { scope: ["scope1"], iss: issuer, exp: Math.floor(Date.now() / 1000) + 3600, ...claims },
    privateKeyPem,
    { algorithm: "RS256", keyid: kid },
  );
  return { jwk, publicKeyPem, sign };
}

function stubIssuer(signingKey: ReturnType<typeof generateSigningKey>) {
  sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
    issuer,
    jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
  } as OIDCConfig);
  sinon.stub(jwks.JwksClient.prototype, "getSigningKey").resolves({
    getPublicKey: () => signingKey.publicKeyPem,
  });
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

  it("should keep refreshing real signing keys while tokens with unknown kid values arrive", async () => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      issuer,
      jwks_uri: "fake uri", // eslint-disable-line @typescript-eslint/naming-convention
    } as OIDCConfig);
    sinon.stub(Logger, "logError");

    const realKey = generateSigningKey("real-key");
    const getKeysStub = sinon.stub(jwks.JwksClient.prototype, "getKeys").resolves([realKey.jwk]);

    const client = new IntrospectionClient();
    expect((await client.introspect(`Bearer ${realKey.sign()}`)).active).to.be.true;

    // Anyone can send tokens with made-up `kid` values. The key is looked up
    // before the signature is checked, so these tokens need no valid signature.
    for (let i = 0; i < 20; i++) {
      const junkToken = jwt.sign({ scope: ["scope1"] }, "not the issuer's key", { keyid: `unknown-kid-${i}` });
      await expect(client.introspect(`Bearer ${junkToken}`)).to.be.rejected;
    }

    // Once the real key's cache entry expires, it must still be fetched again.
    clock.tick(10 * 60 * 1000 + 1);
    const fetchesBefore = getKeysStub.callCount;
    expect((await client.introspect(`Bearer ${realKey.sign()}`)).active).to.be.true;
    expect(getKeysStub.callCount).to.equal(fetchesBefore + 1);
  });

  it("should stop trusting a signing key once the issuer removes it and the cache expires", async () => {
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      issuer,
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
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    const token = signingKey.sign({ exp: Math.floor(Date.now() / 1000) - 60 });

    const response = await new IntrospectionClient().introspect(`Bearer ${token}`);
    expect(response.active).to.be.false;
    expect(response.scope).to.equal("scope1");
  });

  it("should return active:true if token is valid", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);

    const response = await new IntrospectionClient().introspect(`Bearer ${signingKey.sign()}`);
    expect(response.active).to.be.true;
    expect(response.scope).to.equal("scope1");
  });

  it("should not check issuer if none is configured", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    const client = new IntrospectionClient();

    const otherIssuerToken = signingKey.sign({ iss: "https://imsoidc.example.com" });
    expect((await client.introspect(`Bearer ${otherIssuerToken}`)).active).to.be.true;

    const noIssuerToken = signingKey.sign({ iss: undefined });
    expect((await client.introspect(`Bearer ${noIssuerToken}`)).active).to.be.true;
  });

  it("should return active:true if token issuer matches the configured issuer", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    const client = new IntrospectionClient({ issuer: ["https://a.example.com", "https://b.example.com"] });

    const token = signingKey.sign({ iss: "https://b.example.com" });
    expect((await client.introspect(`Bearer ${token}`)).active).to.be.true;
  });

  it("should return active:false if token has a different issuer than the configured issuer", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    const token = signingKey.sign({ iss: "https://attacker.example.com" });

    const response = await new IntrospectionClient({ issuer }).introspect(`Bearer ${token}`);
    expect(response.active).to.be.false;
  });

  it("should return active:false if token has no issuer but one is configured", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    const token = signingKey.sign({ iss: undefined });

    const response = await new IntrospectionClient({ issuer }).introspect(`Bearer ${token}`);
    expect(response.active).to.be.false;
  });

  it("should throw if configured issuer is empty", () => {
    for (const emptyIssuer of ["", [], ["https://a.example.com", ""]])
      expect(() => new IntrospectionClient({ issuer: emptyIssuer })).to.throw("IntrospectionClient issuer must not be empty");
  });

  it("should return active:false if token uses an HMAC algorithm", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    // Sign with the public key as an HMAC secret: the classic algorithm confusion attack.
    const token = jwt.sign(
      { scope: ["scope1"] },
      signingKey.publicKeyPem,
      { algorithm: "HS256", keyid: "kid1", issuer, expiresIn: "1h" },
    );

    const response = await new IntrospectionClient().introspect(`Bearer ${token}`);
    expect(response.active).to.be.false;
  });

  it("should return active:false if token is unsigned", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encode({ alg: "none", typ: "JWT", kid: "kid1" });
    const payload = encode({ scope: ["scope1"], iss: issuer, exp: Math.floor(Date.now() / 1000) + 3600 });

    const response = await new IntrospectionClient().introspect(`Bearer ${header}.${payload}.`);
    expect(response.active).to.be.false;
  });

  it("should not check audience if none is configured", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    const token = signingKey.sign({ aud: "resource-a" });

    const response = await new IntrospectionClient().introspect(`Bearer ${token}`);
    expect(response.active).to.be.true;
  });

  it("should return active:true if token audience matches the configured audience", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    const client = new IntrospectionClient({ audience: ["resource-b", "resource-c"] });

    const singleAudience = signingKey.sign({ aud: "resource-b" });
    expect((await client.introspect(`Bearer ${singleAudience}`)).active).to.be.true;

    const manyAudiences = signingKey.sign({ aud: ["resource-a", "resource-c"] });
    expect((await client.introspect(`Bearer ${manyAudiences}`)).active).to.be.true;
  });

  it("should return active:false if token was issued for a different audience", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);
    const token = signingKey.sign({ aud: "resource-a" });

    const response = await new IntrospectionClient({ audience: "resource-b" }).introspect(`Bearer ${token}`);
    expect(response.active).to.be.false;
  });

  it("should return active:false if token has no audience but one is configured", async () => {
    const signingKey = generateSigningKey("kid1");
    stubIssuer(signingKey);

    const response = await new IntrospectionClient({ audience: "resource-b" }).introspect(`Bearer ${signingKey.sign()}`);
    expect(response.active).to.be.false;
  });

  it("should throw if configured audience is empty", () => {
    for (const emptyAudience of ["", [], ["resource-a", ""]])
      expect(() => new IntrospectionClient({ audience: emptyAudience })).to.throw("IntrospectionClient audience must not be empty");
  });
});
