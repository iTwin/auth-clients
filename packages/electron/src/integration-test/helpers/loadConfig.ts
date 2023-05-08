/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { config } from "dotenv";

export function loadConfig() {
  config();

  if (
    !process.env.IMJS_TEST_ELECTRON_CLIENT_ID ||
    !process.env.IMJS_TEST_REGULAR_USER_NAME ||
    !process.env.IMJS_TEST_REGULAR_USER_PASSWORD
  ) {
    throw new Error(
      "Please expose IMJS_TEST_ELECTRON_CLIENT_ID, IMJS_TEST_REGULAR_USER_NAME and IMJS_TEST_REGULAR_USER_PASSWORD as env variables"
    );
  }

  return {
    clientId: process.env.IMJS_TEST_ELECTRON_CLIENT_ID,
    email: process.env.IMJS_TEST_REGULAR_USER_NAME,
    password: process.env.IMJS_TEST_REGULAR_USER_PASSWORD,
    envPrefix: process.env.IMJS_URL_PREFIX || "",
  };
}
