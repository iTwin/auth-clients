import { config } from "dotenv";
import * as path from "path";
import type { TestBrowserAuthorizationClientConfiguration } from "../TestUsers";

const dotenvExpand = require("dotenv-expand");

export enum TestConfigType {
  OIDC,
  AZURE,
  AUTHING,
}

function loadEnv(envFile: string) {
  const envResult = config({ path: envFile });
  if (!envResult.error) {
    dotenvExpand(envResult);
  }
}

export function loadConfig(
  configType: TestConfigType
): TestBrowserAuthorizationClientConfiguration {
  loadEnv(path.join(__dirname, "..", "..", ".env"));
  config();

  if (configType === TestConfigType.OIDC) {
    if (!process.env.IMJS_OIDC_BROWSER_TEST_CLIENT_ID)
      // IMS oidc config
      throw new Error("Could not find IMJS_OIDC_BROWSER_TEST_CLIENT_ID");

    if (!process.env.IMJS_OIDC_BROWSER_TEST_REDIRECT_URI)
      throw new Error("Could not find IMJS_OIDC_BROWSER_TEST_REDIRECT_URI");

    if (!process.env.IMJS_OIDC_BROWSER_TEST_SCOPES)
      throw new Error("Could not find IMJS_OIDC_BROWSER_TEST_SCOPES");

    return {
      clientId: process.env.IMJS_OIDC_BROWSER_TEST_CLIENT_ID,
      redirectUri: process.env.IMJS_OIDC_BROWSER_TEST_REDIRECT_URI,
      scope: process.env.IMJS_OIDC_BROWSER_TEST_SCOPES,
    };
  }

  if (configType === TestConfigType.AZURE) {
    if (!process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_AUTHORITY)
      throw new Error(
        "Could not find IMJS_OIDC_AZUREAD_BROWSER_TEST_AUTHORITY"
      );
    if (!process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_CLIENT_ID)
      throw new Error(
        "Could not find IMJS_OIDC_AZUREAD_BROWSER_TEST_CLIENT_ID"
      );
    if (!process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_REDIRECT_URI)
      throw new Error(
        "Could not find IMJS_OIDC_AZUREAD_BROWSER_TEST_REDIRECT_URI"
      );
    if (!process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_SCOPES)
      throw new Error("Could not find IMJS_OIDC_AZUREAD_BROWSER_TEST_SCOPES");

    return {
      authority: process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_AUTHORITY,
      clientId: process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_CLIENT_ID,
      redirectUri: process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_REDIRECT_URI,
      scope: process.env.IMJS_OIDC_AZUREAD_BROWSER_TEST_SCOPES,
    };
  }

  if (configType === TestConfigType.AUTHING) {
    if (!process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_AUTHORITY)
      throw new Error(
        "Could not find IMJS_OIDC_AUTHING_BROWSER_TEST_AUTHORITY"
      );

    if (!process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_CLIENT_ID)
      throw new Error(
        "Could not find IMJS_OIDC_AUTHING_BROWSER_TEST_CLIENT_ID"
      );

    if (!process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_REDIRECT_URI)
      throw new Error(
        "Could not find IMJS_OIDC_AUTHING_BROWSER_TEST_REDIRECT_URI"
      );

    if (!process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_SCOPES)
      throw new Error("Could not find IMJS_OIDC_AUTHING_BROWSER_TEST_SCOPES");

    return {
      authority: process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_AUTHORITY,
      clientId: process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_CLIENT_ID,
      redirectUri: process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_REDIRECT_URI,
      scope: process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_SCOPES,
      clientSecret: process.env.IMJS_OIDC_AUTHING_BROWSER_TEST_CLIENT_SECRET,
    };
  }

  throw new Error("Undefined or incorrexct TestConfigType provided");
}
