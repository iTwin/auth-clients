/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ServiceAuthorizationClient } from "../ServiceAuthorizationClient";
import type { OIDCConfig } from "../OIDCDiscoveryClient";
import { OIDCDiscoveryClient } from "../OIDCDiscoveryClient";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function startServer(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function getHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  if (Array.isArray(value))
    return value[0];

  return value ?? "";
}

function getConfig(baseUrl: string): OIDCConfig {
  return {
    /* eslint-disable @typescript-eslint/naming-convention */
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/connect/authorize`,
    jwks_uri: `${baseUrl}/.well-known/jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint: `${baseUrl}/connect/token`,
    /* eslint-enable @typescript-eslint/naming-convention */
  } as OIDCConfig;
}

describe("BaseOpenidClient", () => {
  const testAuthority = "https://test.authority.com";

  it("should use config authority without prefix", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new OIDCDiscoveryClient(testAuthority);
    chai.expect(client.url).equals(testAuthority);
  });

  it("should use config authority and ignore prefix", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new OIDCDiscoveryClient(testAuthority);
    chai.expect(client.url).equals("https://test.authority.com");
  });

  it("should use default authority without prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new OIDCDiscoveryClient();
    chai.expect(client.url).equals("https://ims.bentley.com");
  });

  it("should use default authority with prefix ", async () => {
    process.env.IMJS_URL_PREFIX = "prefix-";
    const client = new OIDCDiscoveryClient();
    chai.expect(client.url).equals("https://prefix-ims.bentley.com");
  });

  it("should discover token end points correctly", async () => {
    process.env.IMJS_URL_PREFIX = "";
    const client = new OIDCDiscoveryClient();
    const url: string = "https://ims.bentley.com";

    const issuer: OIDCConfig = await client.getConfig();
    chai.expect(issuer.token_endpoint).equals(`${url}/connect/token`);
    chai.expect(issuer.authorization_endpoint).equals(`${url}/connect/authorize`);
    chai.expect(issuer.introspection_endpoint).equals(`${url}/connect/introspect`);
  });

  it("should reroute dev prefix to qa if on default ", async () => {
    process.env.IMJS_URL_PREFIX = "dev-";
    const client = new OIDCDiscoveryClient();
    chai.expect(client.url).equals("https://qa-ims.bentley.com");
  });

  it("adds a unique x-correlation-id header to each discovery request", async () => {
    const correlationIds: string[] = [];
    let baseUrl = "";
    const server = createServer((request, response) => {
      correlationIds.push(getHeader(request, "x-correlation-id"));
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(getConfig(baseUrl)));
    });

    baseUrl = await startServer(server);
    try {
      await new OIDCDiscoveryClient(baseUrl).getConfig();
      await new OIDCDiscoveryClient(baseUrl).getConfig();
    } finally {
      await stopServer(server);
    }

    chai.assert.lengthOf(correlationIds, 2);
    chai.assert.match(correlationIds[0], uuidRegex);
    chai.assert.match(correlationIds[1], uuidRegex);
    chai.assert.notEqual(correlationIds[0], correlationIds[1]);
  });

  it("adds a unique x-correlation-id header to each service token request", async () => {
    const correlationIds: string[] = [];
    let baseUrl = "";
    let tokenRequestCount = 0;
    const server = createServer((request, response) => {
      if (request.url?.endsWith("/.well-known/openid-configuration")) {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(getConfig(baseUrl)));
        return;
      }

      if (request.url === "/connect/token") {
        request.resume();
        tokenRequestCount++;
        correlationIds.push(getHeader(request, "x-correlation-id"));
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({
          /* eslint-disable @typescript-eslint/naming-convention */
          token_type: "Bearer",
          access_token: `token-${tokenRequestCount}`,
          expires_in: 1,
          /* eslint-enable @typescript-eslint/naming-convention */
        }));
        return;
      }

      response.statusCode = 404;
      response.end();
    });

    baseUrl = await startServer(server);
    try {
      const client = new ServiceAuthorizationClient({
        clientId: "client-id",
        clientSecret: "client-secret",
        scope: "itwin-platform",
        authority: baseUrl,
      });
      await client.getAccessToken();
      await client.getAccessToken();
    } finally {
      await stopServer(server);
    }

    chai.assert.lengthOf(correlationIds, 2);
    chai.assert.match(correlationIds[0], uuidRegex);
    chai.assert.match(correlationIds[1], uuidRegex);
    chai.assert.notEqual(correlationIds[0], correlationIds[1]);
  });
});
