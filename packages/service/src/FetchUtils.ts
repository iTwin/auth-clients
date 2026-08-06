/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

interface FetchWithRetryOptions {
  retries: number;
  timeout: number;
}

const retryableStatusCodes = new Set([408, 413, 429, 500, 502, 503, 504]);

/**
 * Execute a fetch request with the retry and timeout behavior needed by service authorization.
 * @internal
 */
export async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, options: FetchWithRetryOptions): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if (!retryableStatusCodes.has(response.status) || attempt === options.retries)
        return response;

      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === options.retries)
        throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}
