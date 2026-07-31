// Run from the repository root:
// pnpm --filter @itwin/node-cli-authorization build
// IMJS_OIDC_CLIENT_ID=native-... IMJS_OIDC_ISSUER_URL=https://qa-ims.bentley.com node packages/node-cli/scripts/verify-flow.cjs

const os = require("node:os");
const path = require("node:path");
const { Logger, LogLevel } = require("@itwin/core-bentley");
const {
  NodeCliAuthorizationClient,
  NODE_CLI_AUTH_LOGGER_CATEGORY,
} = require("../lib/cjs");

Logger.initializeToConsole();
Logger.setLevel(NODE_CLI_AUTH_LOGGER_CATEGORY, LogLevel.Trace);

const clientId = process.env.IMJS_OIDC_CLIENT_ID;
if (!clientId) {
  console.error(
    "Set IMJS_OIDC_CLIENT_ID to your Native application client ID.",
  );
  process.exitCode = 1;
  return;
}

const issuerUrl = process.env.IMJS_OIDC_ISSUER_URL ?? "https://ims.bentley.com";
const redirectUri =
  process.env.IMJS_OIDC_REDIRECT_URI ?? "http://localhost:3000/signin-callback";
const scope = process.env.IMJS_OIDC_SCOPES ?? "itwin-platform";
const tokenStorePath =
  process.env.IMJS_AUTH_CACHE_DIR ??
  path.join(os.tmpdir(), "itwin-auth-clients", "node-cli-flow");

async function main() {
  console.log(`Cache: ${tokenStorePath}`);

  const client = new NodeCliAuthorizationClient({
    clientId,
    issuerUrl,
    redirectUri,
    scope,
    tokenStorePath,
  });

  const startedAt = Date.now();
  await client.signIn();
  const accessToken = await client.getAccessToken();

  if (!accessToken.startsWith("Bearer "))
    throw new Error("Authorization completed without a bearer token");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
