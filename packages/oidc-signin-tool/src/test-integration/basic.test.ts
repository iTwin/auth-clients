/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from "@playwright/test";
import type { TestBrowserAuthorizationClientConfiguration } from "../index";
import { getTestAccessToken } from "../TestBrowserAuthorizationClient";
import { TestUsers } from "../TestUsers";
import { TestUtility } from "../TestUtility";
import { loadConfig, TestConfigType } from "./loadConfig";

let oidcConfig: TestBrowserAuthorizationClientConfiguration;

test.beforeEach(() => {
  oidcConfig = loadConfig(TestConfigType.OIDC);
});
test.describe("Sign in (#integration)", () => {
  test("success with valid user", async () => {
    const validUser = TestUsers.regular;
    const token = await getTestAccessToken(oidcConfig, validUser);
    expect(token).toBeDefined();
  });

  // test will not work without using a desktop client. setup correctly on master, will enable there.
  test("success with valid user and iTwin Platform scope", async () => {
    const validUser = TestUsers.regular;
    const token = await getTestAccessToken(
      {
        ...oidcConfig,
        scope: `${oidcConfig.scope} projects:read`,
      },
      validUser,
    );
    expect(token).toBeDefined();
  });

  test("failure with invalid url", async () => {
    const oidcInvalidConfig = { ...oidcConfig, redirectUri: "invalid.com" };
    const validUser = TestUsers.regular;
    await expect(
      getTestAccessToken(oidcInvalidConfig, validUser),
    ).rejects.toThrowError(`400 - Invalid redirect_uri`);
  });

  test("failure with invalid Bentley federated user", async () => {
    await expect(
      getTestAccessToken(oidcConfig, TestUsers.federatedInvalid),
    ).rejects.toThrowError(
      `Failed OIDC signin for ${TestUsers.federatedInvalid.email}.\nError: This username may be incorrect. Make sure you typed it correctly. Otherwise, contact your admin.`,
    );
  });

  test("failure with invalid user", async () => {
    await expect(
      getTestAccessToken(oidcConfig, TestUsers.invalid),
    ).rejects.toThrowError(
      `Failed OIDC signin for ${TestUsers.invalid.email}.\nError: We didn't recognize the email address or password you entered. Please try again.`,
    );
  });
});

test.describe("TestUsers utility (#integration)", () => {
  test("can sign-in all the typically used integration test users", async () => {
    let token = await TestUtility.getAccessToken(TestUsers.regular);
    expect(token).toBeDefined();
    token = await TestUtility.getAccessToken(TestUsers.manager);
    expect(token).toBeDefined();
    token = await TestUtility.getAccessToken(TestUsers.super);
    expect(token).toBeDefined();
    token = await TestUtility.getAccessToken(TestUsers.superManager);
    expect(token).toBeDefined();
  });
});
