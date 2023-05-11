/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import { OIDCDiscoveryClient, OIDCConfig } from "../OIDCDiscoveryClient";


describe("BaseOpenidClient", () => {
  const testAuthority = "https://test.authority.com";

  it("should use config authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new OIDCDiscoveryClient(testAuthority);
    chai.expect(client.url).equals(testAuthority);
  });

  it("should use config authority and ignore prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new OIDCDiscoveryClient(testAuthority);
    chai.expect(client.url).equals("https://test.authority.com");
  });

  it("should use default authority without prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new OIDCDiscoveryClient();
    chai.expect(client.url).equals("https://ims.bentley.com");
  });

  it("should use default authority with prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new OIDCDiscoveryClient();
    chai.expect(client.url).equals("https://prefix-ims.bentley.com");
  });

  it("should discover token end points correctly", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new OIDCDiscoveryClient();
    const url: string = "https://ims.bentley.com";

    const issuer: OIDCConfig = await client.getConfig();
    chai.expect(issuer.token_endpoint).equals(`${url}/connect/token`);
    chai.expect(issuer.authorization_endpoint).equals(`${url}/connect/authorize`);
    chai.expect(issuer.introspection_endpoint).equals(`${url}/connect/introspect`);
  });

  it("should reroute dev prefix to qa if on default ", async () => {
    process.env.IMJS_URL_PREFIX = "dev-";
    const client = new OIDCDiscoveryClient();
    chai.expect(client.url).equals("https://qa-ims.bentley.com");
  });
});
