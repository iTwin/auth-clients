/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { URL } from "node:url";

const requiredProperties = ["issuer", "authorization_endpoint", "jwks_uri", "response_types_supported", "subject_types_supported", "id_token_signing_alg_values_supported"] as const;
const stringProperties = ["issuer", "authorization_endpoint", "jwks_uri", "token_endpoint",
  "userinfo_endpoint", "registration_endpoint", "introspection_endpoint" /* not documented in RFC, but this is what IMS uses */, "service_documentation",
  "op_policy_uri", "op_tos_uri"] as const;
const arrayProperties = ["scopes_supported", "response_types_supported", "response_modes_supported", "grant_types_supported", "acr_values_supported", "subject_types_supported",
  "id_token_signing_alg_values_supported", "id_token_encryption_alg_values_supported",
  "id_token_encryption_enc_values_supported", "userinfo_signing_alg_values_supported", "userinfo_encryption_alg_values_supported", "userinfo_encryption_enc_values_supported",
  "request_object_signing_alg_values_supported", "request_object_encryption_alg_values_supported", "request_object_encryption_enc_values_supported", "token_endpoint_auth_methods_supported",
  "token_endpoint_auth_signing_alg_values_supported", "display_values_supported", "claim_types_supported", "claims_supported", "claims_locales_supported", "ui_locales_supported"] as const;
const booleanProperties = ["claims_parameter_supported", "request_parameter_supported", "request_uri_parameter_supported", "require_request_uri_registration"] as const;

/**
  * Supports the OpenID Connect Discovery 1.0 specification.
  * @internal
  */
export type OIDCConfig =
  { [x in typeof stringProperties[number]]: string | undefined } &
  { [x in typeof arrayProperties[number]]: string[] | undefined } &
  { [x in typeof booleanProperties[number]]: boolean | undefined } &
  { [x in typeof requiredProperties[number] & typeof stringProperties[number]]: string } &
  { [x in typeof requiredProperties[number] & typeof arrayProperties[number]]: string[] } &
  { [x in typeof requiredProperties[number] & typeof booleanProperties[number]]: boolean };

function assertOIDCConfig(obj: any): asserts obj is OIDCConfig {
  for (const prop of requiredProperties) {
    if (!(prop in obj))
      throw new Error(`Invalid OIDC discovery response: missing required property '${prop}'.`);
  }
  for (const prop of stringProperties) {
    if (prop in obj && typeof obj[prop] !== "string")
      throw new Error(`Invalid OIDC discovery response: '${prop}' must be a string.`);
  }
  for (const prop of booleanProperties) {
    if (prop in obj && typeof obj[prop] !== "boolean")
      throw new Error(`Invalid OIDC discovery response: '${prop}' must be a boolean.`);
  }
  for (const prop of arrayProperties) {
    if (prop in obj && (!Array.isArray(obj[prop]) || obj[prop].some((str) => typeof str !== "string")))
      throw new Error(`Invalid OIDC discovery response: '${prop}' must be a boolean.`);
  }
}

/**
  * Utility to get OpenID configuration from the issuer. It should never be used by itself.
  * @internal
  */
export class OIDCDiscoveryClient {
  public url = "https://ims.bentley.com";

  constructor(authority?: string) {
    let prefix = process.env.IMJS_URL_PREFIX;
    const authUrl = new URL(authority ?? this.url);
    if (prefix && !authority) {
      prefix = prefix === "dev-" ? "qa-" : prefix;
      authUrl.hostname = prefix + authUrl.hostname;
    }
    this.url = authUrl.href.replace(/\/$/, "");
  }

  private _discoveredConfig?: OIDCConfig;
  /**
  * Discover the endpoints of the service
  */
  public async getConfig(): Promise<OIDCConfig> {
    if (this._discoveredConfig)
      return this._discoveredConfig;

    const issuerUrl = new URL(this.url);
    issuerUrl.pathname = `${issuerUrl.pathname?.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const response = await (await import("got")).default(issuerUrl, {
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Accept: "application/json",
      },
      throwHttpErrors: false,
    });

    if (response.statusCode < 200 || response.statusCode >= 300 || !response.body)
      throw new Error("Failed to retrieve OpenID configuration from authority");

    const body = JSON.parse(response.body);
    assertOIDCConfig(body);
    return this._discoveredConfig = body;
  }
}
