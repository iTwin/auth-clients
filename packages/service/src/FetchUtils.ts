/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

interface FetchWithRetryOptions {
  retries?: number;
  requestTimeout?: number;
  retryDelay?: number;
}

const defaultFetchWithRetryOptions: Required<FetchWithRetryOptions> = {
  retries: 3,
  requestTimeout: 12000,
  retryDelay: 100,
};

const retryableStatusCodes = new Set([408, 413, 429, 500, 502, 503, 504]);

function getRetryAfterDelay(response: Response): number | undefined {
  const retryAfter = response.headers.get("Retry-After");
  if (!retryAfter)
    return undefined;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds))
    return Math.max(retryAfterSeconds * 1000, 0);

  const retryAfterDate = Date.parse(retryAfter);
  if (Number.isFinite(retryAfterDate))
    return Math.max(retryAfterDate - Date.now(), 0);

  return undefined;
}

function getRetryDelay(response: Response | undefined, attempt: number, retryDelay: number): number {
  if (response) {
    const retryAfterDelay = getRetryAfterDelay(response);
    if (retryAfterDelay !== undefined)
      return retryAfterDelay;
  }

  return retryDelay * 2 ** attempt;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Execute a fetch request with the retry and timeout behavior needed by service authorization.
 * @internal
 */
export async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, options?: FetchWithRetryOptions): Promise<Response> {
  const fetchOptions = {
    ...defaultFetchWithRetryOptions,
    ...options,
  };
  let lastError: unknown;

  for (let attempt = 0; attempt <= fetchOptions.retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchOptions.requestTimeout);
    let retryResponse: Response | undefined;

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if (!retryableStatusCodes.has(response.status) || attempt === fetchOptions.retries)
        return response;

      retryResponse = response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === fetchOptions.retries)
        throw error;
    } finally {
      clearTimeout(timeout);
    }

    await delay(getRetryDelay(retryResponse, attempt, fetchOptions.retryDelay));
  }

  throw lastError;
}
