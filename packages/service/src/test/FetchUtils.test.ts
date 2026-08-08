/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { use as chaiUse, expect } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import { fetchWithRetry } from "../FetchUtils";
chaiUse(chaiAsPromised);

describe("fetchWithRetry", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("returns a successful fetch response without retrying", async () => {
    const response = new Response("ok", { status: 200 });
    const fetchStub = sinon.stub(globalThis, "fetch").resolves(response);

    const result = await fetchWithRetry("https://test.example.com", {
      headers: { accept: "application/json" },
    });

    expect(result).to.equal(response);
    expect(fetchStub.callCount).to.equal(1);
    const [, init] = fetchStub.firstCall.args as [RequestInfo | URL, RequestInit];
    expect(init.headers).to.deep.equal({ accept: "application/json" });
    expect(init.signal).to.be.instanceOf(AbortSignal);
  });

  it("honors Retry-After before retrying a retryable response", async () => {
    const clock = sinon.useFakeTimers();
    const retryResponse = new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "1" },
    });
    const successResponse = new Response("ok", { status: 200 });
    const fetchStub = sinon.stub(globalThis, "fetch");
    fetchStub.onFirstCall().resolves(retryResponse);
    fetchStub.onSecondCall().resolves(successResponse);

    const request = fetchWithRetry("https://test.example.com", {}, {
      requestTimeout: 12000,
      retries: 1,
      retryDelay: 10,
    });

    await clock.tickAsync(999);
    expect(fetchStub.callCount).to.equal(1);

    await clock.tickAsync(1);
    const result = await request;

    expect(result).to.equal(successResponse);
    expect(fetchStub.callCount).to.equal(2);
  });

  it("throws the last fetch error after retry attempts are exhausted", async () => {
    const clock = sinon.useFakeTimers();
    const firstError = new Error("temporary failure");
    const lastError = new Error("still failing");
    const fetchStub = sinon.stub(globalThis, "fetch");
    fetchStub.onFirstCall().rejects(firstError);
    fetchStub.onSecondCall().rejects(lastError);

    const request = fetchWithRetry("https://test.example.com", {}, {
      requestTimeout: 12000,
      retries: 1,
      retryDelay: 10,
    });

    await clock.tickAsync(10);

    await expect(request).to.be.rejectedWith("still failing");
    expect(fetchStub.callCount).to.equal(2);
  });
});
