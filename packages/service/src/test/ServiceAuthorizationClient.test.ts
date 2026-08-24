/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { use as chaiUse, expect } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import type { OIDCConfig } from "../OIDCDiscoveryClient";
import { OIDCDiscoveryClient } from "../OIDCDiscoveryClient";
import { ServiceAuthorizationClient } from "../ServiceAuthorizationClient";
chaiUse(chaiAsPromised);

describe("ServiceAuthorizationClient", () => {
  const tokenEndpoint = "https://test.authority.com/connect/token";

  afterEach(() => {
    sinon.restore();
  });

  function stubDiscovery() {
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      token_endpoint: tokenEndpoint, // eslint-disable-line @typescript-eslint/naming-convention
    } as OIDCConfig);
  }

  function newClient() {
    return new ServiceAuthorizationClient({
      authority: "https://test.authority.com",
      clientId: "client id",
      clientSecret: "client-secret",
      scope: "scope-a scope-b",
    });
  }

  it("requests a service token via fetch with the expected request shape", async () => {
    /* eslint-disable @typescript-eslint/naming-convention */
    stubDiscovery();
    const fetchStub = sinon.stub(globalThis, "fetch").resolves(new Response(JSON.stringify({
      access_token: "test-token",
      expires_in: 3600,
      token_type: "Bearer",
    }), { status: 200 }));

    const client = newClient();
    const token = await client.getAccessToken({ "X-Test": "test-header" });

    expect(token).to.equal("Bearer test-token");
    expect(client.isAuthorized).to.be.true;
    expect(fetchStub.callCount).to.equal(1);

    const [url, init] = fetchStub.firstCall.args as [string, RequestInit];
    expect(url).to.equal(tokenEndpoint);
    expect(init.method).to.equal("POST");
    expect(init.headers).to.deep.equal({
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from("client+id:client-secret").toString("base64")}`,
      "X-Test": "test-header",
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    const requestBody = init.body as URLSearchParams;
    expect(requestBody.get("grant_type")).to.equal("client_credentials");
    expect(requestBody.get("scope")).to.equal("scope-a scope-b");
  });

  it("caches the token and does not fetch again while authorized", async () => {
    stubDiscovery();
    const fetchStub = sinon.stub(globalThis, "fetch").resolves(new Response(JSON.stringify({
      access_token: "test-token", // eslint-disable-line @typescript-eslint/naming-convention
      expires_in: 3600, // eslint-disable-line @typescript-eslint/naming-convention
      token_type: "Bearer", // eslint-disable-line @typescript-eslint/naming-convention
    }), { status: 200 }));

    const client = newClient();
    await client.getAccessToken();
    await client.getAccessToken();

    expect(fetchStub.callCount).to.equal(1);
  });

  it("throws when the token endpoint responds with an error status", async () => {
    stubDiscovery();
    sinon.stub(globalThis, "fetch").resolves(new Response("bad", { status: 400 }));

    const client = newClient();
    await expect(client.getAccessToken()).to.be.rejectedWith("Failed to retrieve service authorization token");
  });

  it("rejects forbidden scopes without making a request", async () => {
    const fetchStub = sinon.stub(globalThis, "fetch");
    const client = new ServiceAuthorizationClient({
      authority: "https://test.authority.com",
      clientId: "client id",
      clientSecret: "client-secret",
      scope: "openid scope-a",
    });

    await expect(client.getAccessToken()).to.be.rejectedWith("Scopes for a service cannot include");
    expect(fetchStub.callCount).to.equal(0);
  });
});
