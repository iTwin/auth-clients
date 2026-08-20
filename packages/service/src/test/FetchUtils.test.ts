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

  it("returns a successful response without retrying and forwards init", async () => {
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

  it("does not retry a non-retryable error status", async () => {
    const response = new Response("nope", { status: 404 });
    const fetchStub = sinon.stub(globalThis, "fetch").resolves(response);

    const result = await fetchWithRetry("https://test.example.com", {});

    expect(result).to.equal(response);
    expect(fetchStub.callCount).to.equal(1);
  });

  it("retries a retryable status code and returns the eventual success", async () => {
    const clock = sinon.useFakeTimers();
    const fetchStub = sinon.stub(globalThis, "fetch");
    fetchStub.onFirstCall().resolves(new Response("busy", { status: 503 }));
    fetchStub.onSecondCall().resolves(new Response("ok", { status: 200 }));

    const request = fetchWithRetry("https://test.example.com", {}, { retries: 3, retryDelay: 10 });

    await clock.tickAsync(10);
    const result = await request;

    expect(result.status).to.equal(200);
    expect(fetchStub.callCount).to.equal(2);
  });

  it("honors a Retry-After header before retrying", async () => {
    const clock = sinon.useFakeTimers();
    const fetchStub = sinon.stub(globalThis, "fetch");
    fetchStub.onFirstCall().resolves(new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "1" },
    }));
    fetchStub.onSecondCall().resolves(new Response("ok", { status: 200 }));

    const request = fetchWithRetry("https://test.example.com", {}, { retries: 1, retryDelay: 10 });

    await clock.tickAsync(999);
    expect(fetchStub.callCount).to.equal(1);

    await clock.tickAsync(1);
    const result = await request;
    expect(result.status).to.equal(200);
    expect(fetchStub.callCount).to.equal(2);
  });

  it("honors a Retry-After given as an HTTP date", async () => {
    const clock = sinon.useFakeTimers();
    const retryAt = new Date(Date.now() + 2000);
    const fetchStub = sinon.stub(globalThis, "fetch");
    fetchStub.onFirstCall().resolves(new Response("busy", {
      status: 503,
      headers: { "Retry-After": retryAt.toUTCString() },
    }));
    fetchStub.onSecondCall().resolves(new Response("ok", { status: 200 }));

    const request = fetchWithRetry("https://test.example.com", {}, { retries: 1, retryDelay: 10 });

    await clock.tickAsync(1000);
    expect(fetchStub.callCount).to.equal(1);

    await clock.tickAsync(1000);
    const result = await request;
    expect(result.status).to.equal(200);
    expect(fetchStub.callCount).to.equal(2);
  });

  it("falls back to exponential backoff when Retry-After is not parseable", async () => {
    const clock = sinon.useFakeTimers();
    const fetchStub = sinon.stub(globalThis, "fetch");
    fetchStub.onFirstCall().resolves(new Response("busy", {
      status: 503,
      headers: { "Retry-After": "not-a-real-date" },
    }));
    fetchStub.onSecondCall().resolves(new Response("ok", { status: 200 }));

    const request = fetchWithRetry("https://test.example.com", {}, { retries: 1, retryDelay: 50 });

    // No Retry-After delay is used, so the first retry fires after retryDelay * 2 ** 0 = 50ms.
    await clock.tickAsync(49);
    expect(fetchStub.callCount).to.equal(1);

    await clock.tickAsync(1);
    const result = await request;
    expect(result.status).to.equal(200);
    expect(fetchStub.callCount).to.equal(2);
  });

  it("returns the last retryable response once retries are exhausted", async () => {
    const clock = sinon.useFakeTimers();
    const fetchStub = sinon.stub(globalThis, "fetch").resolves(new Response("down", { status: 500 }));

    const request = fetchWithRetry("https://test.example.com", {}, { retries: 2, retryDelay: 10 });

    await clock.runAllAsync();
    const result = await request;

    expect(result.status).to.equal(500);
    expect(fetchStub.callCount).to.equal(3);
  });

  it("retries network errors and throws the last error when exhausted", async () => {
    const clock = sinon.useFakeTimers();
    const fetchStub = sinon.stub(globalThis, "fetch");
    fetchStub.onFirstCall().rejects(new Error("temporary failure"));
    fetchStub.onSecondCall().rejects(new Error("still failing"));

    const request = fetchWithRetry("https://test.example.com", {}, { retries: 1, retryDelay: 10 });

    const assertion = expect(request).to.be.rejectedWith("still failing");
    await clock.runAllAsync();
    await assertion;
    expect(fetchStub.callCount).to.equal(2);
  });

  it("aborts a request that goes past the timeout", async () => {
    const clock = sinon.useFakeTimers();
    const fetchStub = sinon.stub(globalThis, "fetch").callsFake(async (_input, init) => {
      return new Promise((_resolve, reject) => {
        (init?.signal)?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });

    const request = fetchWithRetry("https://test.example.com", {}, { retries: 0, timeout: 500 });
    const assertion = expect(request).to.be.rejectedWith("aborted");

    await clock.tickAsync(500);
    await assertion;
    expect(fetchStub.callCount).to.equal(1);
  });
});
