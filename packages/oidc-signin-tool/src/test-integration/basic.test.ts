/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as path from "path";
import * as fs from "fs";
import { expect, test } from "@playwright/test";
import type { TestBrowserAuthorizationClientConfiguration } from "../index";
import { getTestAccessToken, TestUsers, TestUtility } from "../index";

/** Loads the provided `.env` file into process.env */
function loadEnv(envFile: string) {
  if (!fs.existsSync(envFile))
    throw new Error(`Could not find env file at: ${envFile}`);

  const dotenv = require("dotenv"); // eslint-disable-line @typescript-eslint/no-var-requires
  const dotenvExpand = require("dotenv-expand"); // eslint-disable-line @typescript-eslint/no-var-requires
  const envResult = dotenv.config({ path: envFile });
  if (envResult.error) {
    throw envResult.error;
  }

  dotenvExpand(envResult);
}
let oidcConfig: TestBrowserAuthorizationClientConfiguration;

test.beforeEach(() => {
  loadEnv(path.join(__dirname, "..", "..", ".env"));
  // IMS oidc config
  if (process.env.IMJS_OIDC_BROWSER_TEST_CLIENT_ID === undefined)
    throw new Error("Could not find IMJS_OIDC_BROWSER_TEST_CLIENT_ID");
  if (process.env.IMJS_OIDC_BROWSER_TEST_REDIRECT_URI === undefined)
    throw new Error("Could not find IMJS_OIDC_BROWSER_TEST_REDIRECT_URI");
  if (process.env.IMJS_OIDC_BROWSER_TEST_SCOPES === undefined)
    throw new Error("Could not find IMJS_OIDC_BROWSER_TEST_SCOPES");

  oidcConfig = {
    clientId: process.env.IMJS_OIDC_BROWSER_TEST_CLIENT_ID ?? "",
    redirectUri: process.env.IMJS_OIDC_BROWSER_TEST_REDIRECT_URI ?? "",
    scope: process.env.IMJS_OIDC_BROWSER_TEST_SCOPES ?? "",
  };
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
      validUser
    );
    expect(token).toBeDefined();
  });

  test("failure with invalid url", async () => {
    const oidcInvalidConfig = { ...oidcConfig, redirectUri: "invalid.com" };
    const validUser = TestUsers.regular;
    await expect(
      getTestAccessToken(oidcInvalidConfig, validUser)
    ).rejects.toThrowError(`400 - Invalid redirect_uri`);
  });

  test("failure with invalid Bentley federated user", async () => {
    const invalidUser = {
      email: "invalid@bentley.com",
      password: "invalid",
    };

    await expect(
      getTestAccessToken(oidcConfig, invalidUser)
    ).rejects.toThrowError(
      `Failed OIDC signin for ${invalidUser.email}.\nError: Invalid username during AzureAD sign in`
    );
  });

  test("failure with invalid user", async () => {
    const invalidUser = {
      email: "invalid@email.com",
      password: "invalid",
      scope: process.env.IMJS_OIDC_BROWSER_TEST_SCOPES ?? "",
    };
    await expect(
      getTestAccessToken(oidcConfig, invalidUser)
    ).rejects.toThrowError(
      `Failed OIDC signin for ${invalidUser.email}.\nError: We didn't recognize the email address or password you entered. Please try again.`
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

test.describe("Authing and AzureAD (#integration)", () => {
  let azureAdOidcConfig: TestBrowserAuthorizationClientConfiguration;
  let authingOidcConfig: TestBrowserAuthorizationClientConfiguration;

  test.beforeAll(() => {
    // AzureAd oidc config
    loadEnv(path.join(__dirname, "..", "..", ".env"));

    if (process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_AUTHORITY === undefined)
      throw new Error(
        "Could not find IMJS_OIDC_AZUREAD_BROWSER_TEST_AUTHORITY"
      );
    if (process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_CLIENT_ID === undefined)
      throw new Error(
        "Could not find IMJS_OIDC_AZUREAD_BROWSER_TEST_CLIENT_ID"
      );
    if (process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_REDIRECT_URI === undefined)
      throw new Error(
        "Could not find IMJS_OIDC_AZUREAD_BROWSER_TEST_REDIRECT_URI"
      );
    if (process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_SCOPES === undefined)
      throw new Error("Could not find IMJS_OIDC_AZUREAD_BROWSER_TEST_SCOPES");

    azureAdOidcConfig = {
      authority: process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_AUTHORITY,
      clientId: process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_CLIENT_ID ?? "",
      redirectUri:
        process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_REDIRECT_URI ?? "",
      scope: process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_SCOPES ?? "",
    };

    // Authing oidc config
    if (process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_AUTHORITY === undefined)
      throw new Error(
        "Could not find IMJS_OIDC_AUTHING_BROWSER_TEST_AUTHORITY"
      );
    if (process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_CLIENT_ID === undefined)
      throw new Error(
        "Could not find IMJS_OIDC_AUTHING_BROWSER_TEST_CLIENT_ID"
      );
    if (process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_REDIRECT_URI === undefined)
      throw new Error(
        "Could not find IMJS_OIDC_AUTHING_BROWSER_TEST_REDIRECT_URI"
      );
    if (process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_SCOPES === undefined)
      throw new Error("Could not find IMJS_OIDC_AUTHING_BROWSER_TEST_SCOPES");

    authingOidcConfig = {
      authority: process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_AUTHORITY,
      clientId: process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_CLIENT_ID ?? "",
      redirectUri:
        process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_REDIRECT_URI ?? "",
      scope: process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_SCOPES ?? "",
    };
    if (process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_CLIENT_SECRET)
      authingOidcConfig.clientSecret =
        process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_CLIENT_SECRET;
  });

  // reached active user limit
  test.skip("success AzureAD with valid user", async () => {
    if (process.env.IMJS_TEST_AZUREAD_USER_NAME === undefined)
      throw new Error("Could not find IMJS_TEST_AZUREAD_USER_NAME");
    if (process.env.IMJS_TEST_AZUREAD_USER_PASSWORD === undefined)
      throw new Error("Could not find IMJS_TEST_AZUREAD_USER_PASSWORD");

    const validUser = {
      email: process.env.IMJS_TEST_AZUREAD_USER_NAME,
      password: process.env.IMJS_TEST_AZUREAD_USER_PASSWORD,
    };
    const token = await getTestAccessToken(azureAdOidcConfig, validUser);
    expect(token).toBeDefined();
  });
});
