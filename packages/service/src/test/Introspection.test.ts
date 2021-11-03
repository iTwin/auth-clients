/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { IntrospectionClient } from "../introspection/IntrospectionClient";

describe("IntrospectionClient", () => {
  const testAuthority = "https://test.authority.com";
  it("should use config authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new IntrospectionClient({ issuerUrl: testAuthority });
    expect(client.url).equals(testAuthority);
  });

  it("should use config authority and ignore prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new IntrospectionClient({ issuerUrl: testAuthority });
    expect(client.url).equals("https://test.authority.com");
  });

  it("should use default authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new IntrospectionClient();
    expect(client.url).equals("https://ims.bentley.com");
  });

  it("should use default authority with prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new IntrospectionClient();
    expect(client.url).equals("https://prefix-ims.bentley.com");
  });

  it("should reroute dev prefix to qa if on default ", async () => {
    process.env.IMJS_URL_PREFIX = "dev-";
    const client = new IntrospectionClient();
    expect(client.url).equals("https://qa-ims.bentley.com");
  });
});
