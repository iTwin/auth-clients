/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Options controlling the retry and timeout behavior of {@link fetchWithRetry}. */
interface FetchWithRetryOptions {
  /** Maximum number of retries attempted after the initial request. Defaults to 3. */
  retries?: number;
  /** Per-attempt timeout in milliseconds covering both the response headers and body, after which the request is aborted. Defaults to 12000. */
  timeout?: number;
  /** Base delay in milliseconds used for exponential backoff between retries. Defaults to 1000. */
  retryDelay?: number;
}

const defaultOptions: Required<FetchWithRetryOptions> = {
  retries: 3,
  timeout: 12000,
  retryDelay: 1000,
};

const retryStatusCodes = new Set([408, 413, 429, 500, 502, 503, 504, 521, 522, 524]);

// Status codes for which a `Retry-After` header is honored
const retryAfterStatusCodes = new Set([413, 429, 503]);

function parseRetryAfter(value: string | null): number | undefined {
  if (!value)
    return undefined;

  // Upper bound in milliseconds for a server-supplied `Retry-After` delay.
  const maxRetryAfter = 12000;

  let milliseconds: number;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    milliseconds = seconds * 1000;
  } else {
    const date = Date.parse(value);
    if (Number.isNaN(date))
      return undefined;
    milliseconds = date - Date.now();
  }

  return Math.min(Math.max(milliseconds, 0), maxRetryAfter);
}

function computeDelay(response: Response | undefined, attempt: number, retryDelay: number): number {
  if (response && retryAfterStatusCodes.has(response.status)) {
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    if (retryAfter !== undefined)
      return retryAfter;
  }

  return retryDelay * 2 ** attempt;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * A minimal `fetch` wrapper adding retries with exponential backoff on network/timeout errors and
 * retryable status codes, a bounded `Retry-After`, and a per-attempt timeout covering headers and
 * body. Any caller-supplied `init.signal` is composed with the timeout signal.
 * @internal
 */
export async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}, options: FetchWithRetryOptions = {}): Promise<Response> {
  const { retries, timeout, retryDelay } = { ...defaultOptions, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    // Don't keep the event loop alive solely for this timeout timer.
    timer.unref();
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    let retryableResponse: Response | undefined;

    try {
      const response = await fetch(input, { ...init, signal });

      // Return without clearing the timer so it keeps bounding the caller's body read.
      if (attempt === retries || !retryStatusCodes.has(response.status))
        return response;

      // Discard the body before retrying so the underlying socket can be reused/released.
      retryableResponse = response;
      await response.body?.cancel();
      clearTimeout(timer);
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt === retries)
        throw error;
    }

    await delay(computeDelay(retryableResponse, attempt, retryDelay));
  }

  throw lastError;
}
