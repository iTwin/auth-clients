// Run from the repository root:
// pnpm --filter @itwin/electron-authorization build
// IMJS_OIDC_CLIENT_ID=native-... IMJS_OIDC_ISSUER_URL=https://qa-ims.bentley.com pnpm --filter @itwin/electron-authorization exec electron scripts/verify-flow.cjs

const os = require("node:os");
const path = require("node:path");
const { Logger, LogLevel } = require("@itwin/core-bentley");
const { app } = require("electron");
const { ElectronMainAuthorization } = require("../lib/cjs/ElectronMain");
const { electronAuthLoggerCategory } = require("../lib/cjs/common/constants");

Logger.initializeToConsole();
Logger.setLevel(electronAuthLoggerCategory, LogLevel.Trace);

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
const scopes = process.env.IMJS_OIDC_SCOPES ?? "itwin-platform";
const tokenStorePath =
  process.env.IMJS_AUTH_CACHE_DIR ??
  path.join(os.tmpdir(), "itwin-auth-clients", "electron-flow");

async function main() {
  await app.whenReady();
  console.log(`Cache: ${tokenStorePath}`);

  const client = new ElectronMainAuthorization({
    clientId,
    issuerUrl,
    redirectUris: [redirectUri],
    scopes,
    tokenStorePath,
  });

  await client.signIn();
  const accessToken = await client.getAccessToken();

  if (!accessToken.startsWith("Bearer "))
    throw new Error("Authorization completed without a bearer token");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app.quit());
