/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { NodeRequestor } from "@openid/appauth/built/node_support";
import { assert } from "chai";
import * as sinon from "sinon";
import { CorrelationIdRequestor } from "../main/CorrelationIdRequestor.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("CorrelationIdRequestor", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("adds a unique x-correlation-id header to each request", async () => {
    const capturedSettings: JQueryAjaxSettings[] = [];
    sinon.stub(NodeRequestor.prototype, "xhr").callsFake(async <T>(settings: JQueryAjaxSettings): Promise<T> => {
      capturedSettings.push(settings);
      return {} as T;
    });

    const requestor = new CorrelationIdRequestor();
    await requestor.xhr({ url: "https://ims.bentley.com/first", headers: { "x-existing-header": "existing-value" } });
    await requestor.xhr({ url: "https://ims.bentley.com/second" });

    assert.lengthOf(capturedSettings, 2);
    const firstHeaders = capturedSettings[0].headers as Record<string, string>;
    const secondHeaders = capturedSettings[1].headers as Record<string, string>;

    assert.equal(firstHeaders["x-existing-header"], "existing-value");
    assert.match(firstHeaders["x-correlation-id"], uuidRegex);
    assert.match(secondHeaders["x-correlation-id"], uuidRegex);
    assert.notEqual(firstHeaders["x-correlation-id"], secondHeaders["x-correlation-id"]);
  });
});
