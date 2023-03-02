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
    !process.env.BASE_URL ||
    !process.env.CLIENT_ID
  ) {
    throw new Error(
      "Please expose IMJS_TEST_REGULAR_USER_NAME, IMJS_TEST_REGULAR_USER_PASSWORD, BASE_URL, and CLIENT_ID as env variables"
    );
  }

  return {
    IMJS_TEST_REGULAR_USER_NAME: process.env.IMJS_TEST_REGULAR_USER_NAME,
    IMJS_TEST_REGULAR_USER_PASSWORD:
      process.env.IMJS_TEST_REGULAR_USER_PASSWORD,
    BASE_URL: process.env.BASE_URL,
    CLIENT_ID: process.env.CLIENT_ID,
    ENV_PREFIX: process.env.ENV_PREFIX || "",
  };
}
