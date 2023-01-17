/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import type { BrowserAuthorizationClientConfiguration } from "../Client";
import { BrowserAuthorizationClient } from "../Client";


describe("BrowserAuthorizationClient", () => {

  describe("authority has correct prefix", () => {

    const browserConfiguration: BrowserAuthorizationClientConfiguration = {
      clientId: "testClientId",
      redirectUri: "testClientSecret",
      scope: "testScope",
    };
    const testAuthority = "https://test.authority.com";

    it("should use config authority without prefix", async () => {
      process.env.IMJS_URL_PREFIX = "";
      const client = new BrowserAuthorizationClient({ ...browserConfiguration, authority: testAuthority });
      chai.expect(client.getAuthorityUrl()).equals(testAuthority);
    });

    it("should use config authority and ignore prefix", async () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new BrowserAuthorizationClient({ ...browserConfiguration, authority: testAuthority });
      chai.expect(client.getAuthorityUrl()).equals("https://test.authority.com");
    });

    it("should use default authority without prefix ", async () => {
      process.env.IMJS_URL_PREFIX = "";
      const client = new BrowserAuthorizationClient(browserConfiguration);
      chai.expect(client.getAuthorityUrl()).equals("https://ims.bentley.com");
    });

    it("should use default authority with prefix ", async () => {
      process.env.IMJS_URL_PREFIX = "prefix-";
      const client = new BrowserAuthorizationClient(browserConfiguration);
      chai.expect(client.getAuthorityUrl()).equals("https://prefix-ims.bentley.com");
    });

    it("should reroute dev prefix to qa if on default ", async () => {
      process.env.IMJS_URL_PREFIX = "dev-";
      const client = new BrowserAuthorizationClient(browserConfiguration);
      chai.expect(client.getAuthorityUrl()).equals("https://qa-ims.bentley.com");
    });
  });
});
