/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";

import { BakedAuthorizationConfiguration } from "../Client";
import type { NodeCliAuthorizationConfiguration } from "../Client";

chai.use(chaiAsPromised);

describe("NodeCliAuthorizationConfiguration Authority URL Logic", () => {
  const config: NodeCliAuthorizationConfiguration = {
    clientId: "testClientId",
    scope: "testScope",
  };
  const testAuthority = "https://test.authority.com";

  it("should use config authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const bakedConfig = new BakedAuthorizationConfiguration({ ...config, issuerUrl: testAuthority });
    chai.expect(bakedConfig.issuerUrl).equals(testAuthority);
  });

  it("should use config authority and ignore prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const bakedConfig = new BakedAuthorizationConfiguration({ ...config, issuerUrl: testAuthority });
    chai.expect(bakedConfig.issuerUrl).equals("https://test.authority.com");
  });

  it("should use default authority without prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const bakedConfig = new BakedAuthorizationConfiguration(config);
    chai.expect(bakedConfig.issuerUrl).equals("https://ims.bentley.com");
  });

  it("should use default authority with prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const bakedConfig = new BakedAuthorizationConfiguration(config);
    chai.expect(bakedConfig.issuerUrl).equals("https://prefix-ims.bentley.com");
  });

  it("should reroute dev prefix to qa if on default ", async () => {
    process.env.IMJS_URL_PREFIX = "dev-";
    const bakedConfig = new BakedAuthorizationConfiguration(config);
    chai.expect(bakedConfig.issuerUrl).equals("https://qa-ims.bentley.com");
  });
});

describe("NodeCliAuthorizationConfiguration Config Scope Logic", () => {
  const config: NodeCliAuthorizationConfiguration = {
    clientId: "testClientId",
    scope: "testScope",
  };

  it("Should add offline_access scope", async () => {
    const bakedConfig = new BakedAuthorizationConfiguration(config);
    chai.expect(bakedConfig.scopes).equals(`${config.scope} offline_access`);
  });

  it("Should not add offline_access scope", async () => {
    const bakedConfig = new BakedAuthorizationConfiguration({
      clientId: "testClientId",
      scope: "testScope offline_access",
    });
    chai.expect(bakedConfig.scopes).equals("testScope offline_access");
  });
});

