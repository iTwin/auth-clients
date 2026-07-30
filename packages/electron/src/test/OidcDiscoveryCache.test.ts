/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert } from "chai";
import * as sinon from "sinon";
import { OidcDiscoveryCache } from "../main/OidcDiscoveryCache.js";

const issuer = "https://qa-ims.bentley.com";
const discoveryDocument = {
  issuer,
  authorization_endpoint: `${issuer}/connect/authorize`,
  token_endpoint: `${issuer}/connect/token`,
  revocation_endpoint: `${issuer}/connect/revoke`,
  end_session_endpoint: `${issuer}/connect/endsession`,
};

describe("OidcDiscoveryCache", () => {
  let cacheDirectory: string;
  let decryptStub: sinon.SinonStub;

  beforeEach(async () => {
    sinon.restore();
    cacheDirectory = await mkdtemp(join(tmpdir(), "electron-oidc-discovery-"));
    sinon
      .stub(OidcDiscoveryCache.prototype, "encrypt" as any)
      .callsFake(async (...args: unknown[]) => Buffer.from(args[0] as string));
    decryptStub = sinon
      .stub(OidcDiscoveryCache.prototype, "decrypt" as any)
      .callsFake(async (...args: unknown[]) =>
        Buffer.from(args[0] as Buffer).toString(),
      );
  });

  afterEach(async () => {
    sinon.restore();
    await rm(cacheDirectory, { recursive: true, force: true });
  });

  function stubDiscovery(cacheControl = "max-age=86400") {
    return sinon.stub(globalThis, "fetch").resolves({
      ok: true,
      status: 200,
      headers: new Headers({ "cache-control": cacheControl }),
      json: async () => discoveryDocument,
    } as Response);
  }

  it("reuses a fresh encrypted configuration across instances", async () => {
    const fetchStub = stubDiscovery();

    await new OidcDiscoveryCache(issuer, cacheDirectory).getConfiguration();
    const cached = await new OidcDiscoveryCache(
      issuer,
      cacheDirectory,
    ).getConfiguration();

    sinon.assert.calledOnce(fetchStub);
    assert.equal(cached.tokenEndpoint, discoveryDocument.token_endpoint);
  });

  it("does not persist a response marked no-store", async () => {
    const fetchStub = stubDiscovery("no-store, max-age=86400");

    await new OidcDiscoveryCache(issuer, cacheDirectory).getConfiguration();
    await new OidcDiscoveryCache(issuer, cacheDirectory).getConfiguration();

    sinon.assert.calledTwice(fetchStub);
  });

  it("treats an undecryptable cache entry as a miss", async () => {
    const fetchStub = stubDiscovery();
    await new OidcDiscoveryCache(issuer, cacheDirectory).getConfiguration();

    decryptStub.rejects(new Error("tampered"));
    await new OidcDiscoveryCache(issuer, cacheDirectory).getConfiguration();

    sinon.assert.calledTwice(fetchStub);
  });

  it("rejects a Bentley token endpoint on another origin", async () => {
    sinon.stub(globalThis, "fetch").resolves({
      ok: true,
      status: 200,
      headers: new Headers({ "cache-control": "max-age=86400" }),
      json: async () => ({
        ...discoveryDocument,
        token_endpoint: "https://example.com/connect/token",
      }),
    } as Response);

    await assert.isRejected(
      new OidcDiscoveryCache(issuer, cacheDirectory).getConfiguration(),
      "configured issuer origin",
    );
  });

  it("rejects an HTTP loopback issuer", async () => {
    const loopbackIssuer = "http://127.0.0.1:3000";
    sinon.stub(globalThis, "fetch").resolves({
      ok: true,
      status: 200,
      headers: new Headers({ "cache-control": "max-age=86400" }),
      json: async () => ({
        issuer: loopbackIssuer,
        authorization_endpoint: `${loopbackIssuer}/authorize`,
        token_endpoint: `${loopbackIssuer}/token`,
        revocation_endpoint: `${loopbackIssuer}/revoke`,
      }),
    } as Response);

    await assert.isRejected(
      new OidcDiscoveryCache(loopbackIssuer, cacheDirectory).getConfiguration(),
      "issuer must use HTTPS",
    );
  });
});
