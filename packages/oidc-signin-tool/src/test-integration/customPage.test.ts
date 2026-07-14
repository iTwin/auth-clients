/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from "@playwright/test";
import type { TestBrowserAuthorizationClientConfiguration } from "../index";
import { getTestAccessToken } from "../TestBrowserAuthorizationClient";
import { TestUsers } from "../TestUsers";
import { loadConfig, TestConfigType } from "./loadConfig";

let oidcConfig: TestBrowserAuthorizationClientConfiguration;

test.beforeEach(() => {
  oidcConfig = loadConfig(TestConfigType.OIDC);
});

test.describe("Sign in with a caller-provided page (#integration)", () => {
  test("succeeds and does not close the provided page or browser", async ({ browser }) => {
    const page = await browser.newPage();
    try {
      const token = await getTestAccessToken(oidcConfig, TestUsers.regular, { page });

      // sign-in succeeded
      expect(token).toBeDefined();

      // the tool must not close/kill a page and browser it did not create
      expect(page.isClosed()).toBe(false);
      expect(browser.isConnected()).toBe(true);

      // the provided page is still usable afterwards
      expect(await page.evaluate(() => 1 + 1)).toBe(2);
    } finally {
      await page.close();
    }
  });
});
