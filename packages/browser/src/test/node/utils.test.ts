/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { assert } from "chai";
import { getImsAuthority } from "../../utils";

describe("getImsAuthority", () => {

  it("has no prefix when no prefix is defined", async () => {
    process.env.IMJS_URL_PREFIX = "";

    assert.equal(getImsAuthority(), "https://ims.bentley.com");
  });

  it("has correct prefix when prefix is defined", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";

    assert.equal(getImsAuthority(), "https://prefix-ims.bentley.com");
  });

  it("replaces \"dev-\" prefix with \"qa-\"", async () => {
    process.env.IMJS_URL_PREFIX = "dev-";

    assert.equal(getImsAuthority(), "https://qa-ims.bentley.com");
  });

  it("does not modify \"qa-\" prefix", async () => {
    process.env.IMJS_URL_PREFIX = "qa-";

    assert.equal(getImsAuthority(), "https://qa-ims.bentley.com");
  });
});
