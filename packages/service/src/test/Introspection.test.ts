/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import * as sinon from "sinon";
import { MemoryIntrospectionResponseCache } from "../introspection/IntrospectionResponseCacheBase";
import { IntrospectionResponse } from "../introspection/IntrospectionResponse";
import { IntrospectionClient, IntrospectionClientConfiguration } from "..";

describe("MemoryIntrospectionResponseCache", async () => {
  it("adds the token to the cache with a valid expiration", async () => {
    const testRes: IntrospectionResponse = {
      active: true,
      client_id: "test", // eslint-disable-line @typescript-eslint/naming-convention
      scope: "test",
      exp: Date.now() + 10000, // make the timeout long enough it won't be removed.
    };

    const newCache = new MemoryIntrospectionResponseCache();
    await newCache.add("test", testRes);

    const res = await newCache.get("test");
    assert.isDefined(res);
    assert.equal(res?.client_id, "test");
  });

  it("does not add the token to the cache when the token is already expired", async () => {
    const testRes: IntrospectionResponse = {
      active: true,
      client_id: "test", // eslint-disable-line @typescript-eslint/naming-convention
      scope: "test",
      exp: new Date().getTime() / 1000 - 10000, // make the timeout prior to the time right now.
    };

    const newCache = new MemoryIntrospectionResponseCache();
    await newCache.add("test", testRes);

    const res = await newCache.get("test");
    assert.isUndefined(res);
  });

  it("does not add to the cache if missing an expiration in response object", async () => {
    const testRes: IntrospectionResponse = {
      active: true,
      client_id: "test", // eslint-disable-line @typescript-eslint/naming-convention
      scope: "test",
    };

    const newCache = new MemoryIntrospectionResponseCache();
    await newCache.add("test", testRes);

    const res = await newCache.get("test");
    assert.isUndefined(res);
  });

  it("adds the response to the cache and removes it after a timeout", async () => {
    const clock = sinon.useFakeTimers();

    const testRes: IntrospectionResponse = {
      active: true,
      client_id: "test", // eslint-disable-line @typescript-eslint/naming-convention
      scope: "test",
      exp: (new Date().getTime() + 10) / 1000,
    };

    const newCache = new MemoryIntrospectionResponseCache();
    await newCache.add("test", testRes);

    let res = await newCache.get("test");
    assert.isDefined(res);
    assert.equal(res?.client_id, "test");

    // set clock to go past timeout
    clock.tick(100);

    // the key should be removed
    res = await newCache.get("test");
    assert.isUndefined(res);

    clock.restore();
  });
});

describe("IntrospectionClient", () => {
  const introspectionConfig: IntrospectionClientConfiguration = {
    clientId: "testClientId",
    clientSecret: "testClientSecret",
  };
  const testAuthority = "https://test.authority.com";
  it("should use config authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new IntrospectionClient({ ...introspectionConfig, issuerUrl: testAuthority });
    expect(client.url).equals(testAuthority);
  });

  it("should use config authority and ignore prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new IntrospectionClient({ ...introspectionConfig, issuerUrl: testAuthority });
    expect(client.url).equals("https://test.authority.com");
  });

  it("should use default authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new IntrospectionClient(introspectionConfig);
    expect(client.url).equals("https://ims.bentley.com");
  });

  it("should use default authority with prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new IntrospectionClient(introspectionConfig);
    expect(client.url).equals("https://prefix-ims.bentley.com");
  });
});
