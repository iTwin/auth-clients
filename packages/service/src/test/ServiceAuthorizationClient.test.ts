/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import type { OIDCConfig } from "../OIDCDiscoveryClient";
import { OIDCDiscoveryClient } from "../OIDCDiscoveryClient";
import { ServiceAuthorizationClient } from "../ServiceAuthorizationClient";

describe("ServiceAuthorizationClient", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should request a service token using fetch", async () => {
    /* eslint-disable @typescript-eslint/naming-convention */
    sinon.stub(OIDCDiscoveryClient.prototype, "getConfig").resolves({
      token_endpoint: "https://test.authority.com/connect/token",
    } as OIDCConfig);

    const fetchStub = sinon.stub(globalThis, "fetch").resolves(new Response(JSON.stringify({
      access_token: "test-token",
      expires_in: 3600,
      token_type: "Bearer",
    })));

    const client = new ServiceAuthorizationClient({
      authority: "https://test.authority.com",
      clientId: "client id",
      clientSecret: "client-secret",
      scope: "scope-a scope-b",
    });

    const token = await client.getAccessToken({ "X-Test": "test-header" });

    expect(token).to.equal("Bearer test-token");
    expect(fetchStub.callCount).to.equal(1);

    const [url, init] = fetchStub.firstCall.args as [string, RequestInit];
    expect(url).to.equal("https://test.authority.com/connect/token");
    expect(init.method).to.equal("POST");
    expect(init.headers).to.deep.equal({
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from("client+id:client-secret").toString("base64")}`,
      "X-Test": "test-header",
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).to.equal("client_credentials");
    expect(body.get("scope")).to.equal("scope-a scope-b");
  });
});
