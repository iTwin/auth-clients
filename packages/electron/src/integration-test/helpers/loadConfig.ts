/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// eslint@typescript-eslint/naming-convention
import { config } from "dotenv";

export function loadConfig() {
  config();

  if (
    !process.env.clientId ||
    !process.env.IMJS_TEST_REGULAR_USER_NAME ||
    !process.env.IMJS_TEST_REGULAR_USER_PASSWORD
  ) {
    throw new Error(
      "Please expose clientId, IMJS_TEST_REGULAR_USER_NAME and IMJS_TEST_REGULAR_USER_PASSWORD as env variables"
    );
  }

  return {
    clientId: process.env.clientId,
    email: process.env.IMJS_TEST_REGULAR_USER_NAME,
    password: process.env.IMJS_TEST_REGULAR_USER_PASSWORD,
    envPrefix: process.env.IMJS_URL_PREFIX || "",
  };
}
