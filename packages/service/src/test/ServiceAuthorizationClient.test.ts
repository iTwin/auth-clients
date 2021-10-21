/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import { ServiceAuthorizationClient } from "../ServiceAuthorizationClient";
import { ServiceAuthorizationClientConfiguration } from "../ServiceAuthorizationClientConfiguration";
import { Client, Issuer } from "openid-client";

describe("ServiceAuthorizationClient", () => {

  const serviceConfiguration: ServiceAuthorizationClientConfiguration = {
    clientId: "testClientId",
    clientSecret: "testClientSecret",
    scope: "testScope",
  };
  const testAuthority = "https://test.authority.com";

  it("should use config authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new ServiceAuthorizationClient({...serviceConfiguration, authority: testAuthority});
    chai.expect(client.url).equals(testAuthority);
  });

  it("should use config authority with prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new ServiceAuthorizationClient({...serviceConfiguration, authority: testAuthority});
    chai.expect(client.url).equals("https://prefix-test.authority.com");
  });

  it("should use default authority without prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new ServiceAuthorizationClient(serviceConfiguration);
    chai.expect(client.url).equals("https://ims.bentley.com");
  });

  it("should use default authority with prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new ServiceAuthorizationClient(serviceConfiguration);
    chai.expect(client.url).equals("https://prefix-ims.bentley.com");
  });

  it("should discover token end points correctly", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new ServiceAuthorizationClient(serviceConfiguration);
    const url: string = "https://ims.bentley.com";

    const issuer: Issuer<Client> = await client.discoverEndpoints();
    chai.expect(issuer.token_endpoint).equals(`${url}/connect/token`);
    chai.expect(issuer.authorization_endpoint).equals(`${url}/connect/authorize`);
    chai.expect(issuer.introspection_endpoint).equals(`${url}/connect/introspect`);
  });
});
