/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";

import { BakedAuthorizationConfiguration, makeAppStorageKey } from "../Client";
import type { NodeCliAuthorizationConfiguration } from "../Client";

chai.use(chaiAsPromised);

describe("NodeCliAuthorizationConfiguration defaults", () => {
  it("should throw if clientId is an empty string", () => {
    chai.expect(() => new BakedAuthorizationConfiguration({ clientId: "", scope: "testScope" })).to.throw();
  });

  it("should throw if scope is an empty string", () => {
    chai.expect(() => new BakedAuthorizationConfiguration({ clientId: "testClientId", scope: "" })).to.throw();
  });
});

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

describe("NodeCliAuthorizationConfiguration TokenStore Key Logic", () => {
  const baselineKeyArgs = {
    clientId: "testClientId",
    issuerUrl: "https://test.authority.com",
    scopes: "testScope:read testScope:modify",
  };
  const baselineKey = makeAppStorageKey(baselineKeyArgs);

  it("should create different keys based on clientId", () => {
    const testKeyArgs = { ...baselineKeyArgs };
    testKeyArgs.clientId = "anotherClientId";
    const testKey = makeAppStorageKey(testKeyArgs);
    chai.expect(testKey).is.not.equal(baselineKey);
  });

  it("should create different keys based on issuerUrl", () => {
    const testKeyArgs = { ...baselineKeyArgs };
    testKeyArgs.issuerUrl = "https://test.new-authority.com";
    const testKey = makeAppStorageKey(testKeyArgs);
    chai.expect(testKey).is.not.equal(baselineKey);
  });

  it("should create different keys based on scopes", () => {
    const testKeyArgs = { ...baselineKeyArgs };
    testKeyArgs.scopes = "anotherScope:read";
    const testKey = makeAppStorageKey(testKeyArgs);
    chai.expect(testKey).is.not.equal(baselineKey);
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

