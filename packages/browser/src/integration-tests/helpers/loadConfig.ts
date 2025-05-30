/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { config } from "dotenv";

export function loadConfig() {
  config();

  if (
    !process.env.IMJS_TEST_REGULAR_USER_NAME ||
    !process.env.IMJS_TEST_REGULAR_USER_PASSWORD ||
    !process.env.ITJS_AUTH_CLIENTS_BROWSER_BASE_URL ||
    !process.env.ITJS_AUTH_CLIENTS_BROWSER_CLIENT_ID
  ) {
    throw new Error(
      "Please expose IMJS_TEST_REGULAR_USER_NAME, IMJS_TEST_REGULAR_USER_PASSWORD, BASE_URL, and CLIENT_ID as env variables"
    );
  }

  return {
    email: process.env.IMJS_TEST_REGULAR_USER_NAME,
    password: process.env.IMJS_TEST_REGULAR_USER_PASSWORD,
    url: process.env.ITJS_AUTH_CLIENTS_BROWSER_BASE_URL,
    clientId: process.env.ITJS_AUTH_CLIENTS_BROWSER_CLIENT_ID,
    envPrefix: process.env.IMJS_URL_PREFIX || "",
  };
}
