# Migration guide

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

### Register backend callbacks

Before:

```typescript
import "@itwin/oidc-signin-tool/lib/cjs/certa/certaBackend";
```

After:

```typescript
import { registerBackendCallback } from "@itwin/certa/lib/utils/CallbackUtils";
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
import { executeBackendCallback } from "@itwin/certa/lib/utils/CallbackUtils";

const accessToken = await executeBackendCallback("getToken", user, oidcConfig);
const serviceToken = await executeBackendCallback(
  "getServiceAuthToken",
  serviceConfig,
);
```

The `lib/cjs/frontend` entrypoint still exports the non-Certa `TestUsers` and
`TestFrontendAuthorizationClient` browser APIs.
