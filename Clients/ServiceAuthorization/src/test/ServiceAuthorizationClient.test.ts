/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import { Client, Issuer } from "openid-client";
import * as path from "path";
import { ClientRequestContext } from "@bentley/bentleyjs-core";
import { ServiceAuthorizationClient, ServiceAuthorizationClientConfiguration } from "../ServiceAuthorizationClient";
import { HubAccessTestValidator } from "./HubAccessTestValidator";
import * as fs from "fs";

/** Loads the provided `.env` file into process.env */
function loadEnv(envFile: string) {
  if (!fs.existsSync(envFile))
    return;

  const dotenv = require("dotenv"); // eslint-disable-line @typescript-eslint/no-var-requires
  const dotenvExpand = require("dotenv-expand"); // eslint-disable-line @typescript-eslint/no-var-requires
  const envResult = dotenv.config({ path: envFile });
  if (envResult.error) {
    throw envResult.error;
  }

  dotenvExpand(envResult);
}

loadEnv(path.join(__dirname, "..", "..", ".env"));

chai.should();

describe("ServiceAuthorizationClient (#integration)", () => {

  let validator: HubAccessTestValidator;
  const requestContext = new ClientRequestContext();

  let agentConfiguration: ServiceAuthorizationClientConfiguration;

  before(async () => {
    validator = await HubAccessTestValidator.getInstance();

    if (process.env.IMJS_AGENT_TEST_CLIENT_ID === undefined)
      throw new Error("Could not find IMJS_AGENT_TEST_CLIENT_ID");
    if (process.env.IMJS_AGENT_TEST_CLIENT_SECRET === undefined)
      throw new Error("Could not find IMJS_AGENT_TEST_CLIENT_SECRET");

    agentConfiguration = {
      clientId: process.env.IMJS_AGENT_TEST_CLIENT_ID ?? "",
      clientSecret: process.env.IMJS_AGENT_TEST_CLIENT_SECRET ?? "",
      scope: "imodelhub rbac-user:external-client reality-data:read urlps-third-party context-registry-service:read-only imodeljs-backend-2686",
    };

  });

  it("should discover token end points correctly", async () => {
    const client = new ServiceAuthorizationClient(agentConfiguration);
    const url: string = client.getUrl();

    const issuer: Issuer<Client> = await client.discoverEndpoints(requestContext);
    chai.expect(issuer.token_endpoint).equals(`${url}/connect/token`);
    chai.expect(issuer.authorization_endpoint).equals(`${url}/connect/authorize`);
    chai.expect(issuer.introspection_endpoint).equals(`${url}/connect/introspect`);
  });

  it("should get valid OIDC tokens for agent applications", async () => {
    const agentClient = new ServiceAuthorizationClient(agentConfiguration);
    const now = Date.now();
    const jwt: AccessToken = await agentClient.getAccessToken(requestContext);

    const expiresAt = agentClient.expiry; // TODO: Would have to make expiration public - any other way to test?
    chai.assert.isDefined(expiresAt);
    chai.assert.isAbove(expiresAt.getTime(), now);

    await validator.validateContextRegistryAccess(jwt);
    await validator.validateIModelHubAccess(jwt);

    const refreshJwt: AccessToken = await agentClient.getAccessToken(requestContext);
    await validator.validateContextRegistryAccess(refreshJwt);
    await validator.validateIModelHubAccess(refreshJwt);
  });

  it("should not refresh token unless necessary", async () => {
    const agentClient = new ServiceAuthorizationClient(agentConfiguration);

    const jwt: AccessToken = await agentClient.getAccessToken(requestContext);

    // Refresh after a second, and the token should remain the same
    await BeDuration.wait(1000);
    const refreshJwt: AccessToken = await agentClient.getAccessToken(requestContext);
    chai.assert.strictEqual(refreshJwt, jwt);

    // TODO: Should we remove these next two sections now that we are changing accessToken? Can me mock the expiry?

    // Set the expiry of the token to be 2 min from now, and the token should remain the same
    const twoMinFromNow = new Date(Date.now() + 2 * 60 * 1000);
    const jwtExpiresAtTwoMinFromNow = new AccessToken(jwt.toTokenString(IncludePrefix.No), jwt.getStartsAt(), twoMinFromNow, jwt.getUserInfo());
    (agentClient as any)._accessToken = jwtExpiresAtTwoMinFromNow;
    refreshJwt = await agentClient.getAccessToken(requestContext);
    chai.assert.strictEqual(refreshJwt, jwtExpiresAtTwoMinFromNow);

    // Set the expiry of the token to be less than a min from now, and the token should be refreshed
    const lessThanMinFromNow = new Date(Date.now() + 59 * 1000);
    const jwtExpiresAtLessThanMinFromNow = new AccessToken(jwt.toTokenString(IncludePrefix.No), jwt.getStartsAt(), lessThanMinFromNow, jwt.getUserInfo());
    (agentClient as any)._accessToken = jwtExpiresAtLessThanMinFromNow;
    refreshJwt = await agentClient.getAccessToken(requestContext);
    chai.assert.notStrictEqual(refreshJwt.toTokenString(IncludePrefix.No), jwtExpiresAtLessThanMinFromNow.toTokenString(IncludePrefix.No));
  });
});
