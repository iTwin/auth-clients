# Migration guide

Version 7 makes two changes:

- It removes the Certa helpers. Test suites that run on Certa now register and invoke their own callbacks.
- It adds package entry points, so consumers no longer need `lib/cjs` deep imports.

## Migrating Certa tests

Version 7 removes these Certa-specific APIs from `@itwin/oidc-signin-tool`:

- `lib/cjs/certa/certaCommon`
- `lib/cjs/certa/certaBackend`
- `getAccessTokenFromBackend`
- `getServiceAuthTokenFromBackend`
- `getTokenCallbackName`
- `getServiceAuthTokenCallbackName`

Certa test packages must declare `@itwin/certa` directly and own their callback
registration and execution. Packages using service authorization must also declare
`@itwin/service-authorization` directly.

The examples import from `@itwin/certa/callbacks`, which Certa 5.15 and later export.
On earlier Certa versions, import the same functions from
`@itwin/certa/lib/utils/CallbackUtils`. Test suites on another runner register the
same backend functions with that runner's callback mechanism; only the `TestUtility`
and `ServiceAuthorizationClient` calls come from these packages.

### Register backend callbacks

Before:

```typescript
import "@itwin/oidc-signin-tool/lib/cjs/certa/certaBackend";
```

After:

```typescript
import { registerBackendCallback } from "@itwin/certa/callbacks";
import {
  TestUtility,
  type TestBrowserAuthorizationClientConfiguration,
  type TestUserCredentials,
} from "@itwin/oidc-signin-tool";
import {
  ServiceAuthorizationClient,
  type ServiceAuthorizationClientConfiguration,
} from "@itwin/service-authorization";

registerBackendCallback(
  "getToken",
  async (
    user: TestUserCredentials,
    oidcConfig?: TestBrowserAuthorizationClientConfiguration,
  ) => {
    return oidcConfig
      ? TestUtility.getAuthorizationClient(user, oidcConfig).getAccessToken()
      : TestUtility.getAccessToken(user);
  },
);

registerBackendCallback(
  "getServiceAuthToken",
  async (oidcConfig: ServiceAuthorizationClientConfiguration) => {
    const token = await new ServiceAuthorizationClient(oidcConfig).getAccessToken();
    if (!token)
      throw new Error("Failed to get service authorization token");

    return token;
  },
);
```

Place this code in a consumer-owned `backendInitModule`. If `certa.json` points
directly to the removed `certaBackend` module, update it to point to the new module.

The removed adapter loaded and expanded `.env` from the working directory. Load the
environment in the consumer-owned module if the test setup does not already do so.

### Execute callbacks from frontend tests

Before:

```typescript
import {
  getAccessTokenFromBackend,
  getServiceAuthTokenFromBackend,
} from "@itwin/oidc-signin-tool/lib/cjs/frontend";

const accessToken = await getAccessTokenFromBackend(user, oidcConfig);
const serviceToken = await getServiceAuthTokenFromBackend(serviceConfig);
```

After:

```typescript
import { executeBackendCallback } from "@itwin/certa/callbacks";

async function getTokenFromBackend(name: string, ...args: unknown[]): Promise<string> {
  const token: unknown = await executeBackendCallback(name, ...args);
  if (typeof token !== "string")
    throw new Error(`Expected callback "${name}" to return a token string, got ${typeof token}.`);
  return token;
}

const accessToken = await getTokenFromBackend("getToken", user, oidcConfig);
const serviceToken = await getTokenFromBackend("getServiceAuthToken", serviceConfig);
```

`executeBackendCallback` returns an untyped value, so the helper checks the result before
tests use it as a token.

## Using package entry points

Version 7 declares these entry points:

| Entry point | Use it for |
|---|---|
| `@itwin/oidc-signin-tool` | Node test code that signs in a test user: `TestBrowserAuthorizationClient`, `getTestAccessToken`, `TestUtility`, and `TestUsers`. |
| `@itwin/oidc-signin-tool/frontend` | Browser test code: `TestUsers` and `TestFrontendAuthorizationClient`. It does not load Playwright, Node built-ins, or Certa. |
| `@itwin/oidc-signin-tool/electron` | Playwright tests that sign in through an Electron app's main process: `loginElectronMainAuthClient` and `logoutElectronMainAuthClient`. |

`lib/cjs/*` deep imports still resolve in version 7, but they are not supported entry
points and may stop resolving in a later major version. Replace them as follows.

Before:

```typescript
import { TestUsers } from "@itwin/oidc-signin-tool/lib/cjs/TestUsers";
import { TestFrontendAuthorizationClient } from "@itwin/oidc-signin-tool/lib/cjs/frontend";
import {
  loginElectronMainAuthClient,
  logoutElectronMainAuthClient,
} from "@itwin/oidc-signin-tool/lib/cjs/loginElectronMainAuthClient";
```

After:

```typescript
import { TestFrontendAuthorizationClient, TestUsers } from "@itwin/oidc-signin-tool/frontend";
import {
  loginElectronMainAuthClient,
  logoutElectronMainAuthClient,
} from "@itwin/oidc-signin-tool/electron";
```

Node test code can import `TestUsers` from the package root instead. The entry points
resolve with TypeScript's `node`, `node16`, `nodenext`, and `bundler` module resolution.
