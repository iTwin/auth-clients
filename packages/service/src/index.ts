/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
export * from "./ServiceAuthorizationClient";
export * from "./ServiceAuthorizationClientConfiguration";
export * from "./ServiceClientLoggerCategory";
export * from "./OIDCDiscoveryClient";

export * from "./introspection/IntrospectionClient";
export * from "./introspection/IntrospectionResponse";
export * from "./introspection/ImsIntrospectionResponse";

/** @docs-package-description
 ## Usage

```typescript
const client = new ServiceAuthorizationClient(serviceConfiguration: ServiceAuthorizationClientConfiguration)
// retrieve a new access token
const token = await client.getAccessToken()
```

ServiceAuthorizationClientConfiguration

| Property     | Type   | Description                                                                                                                       | Required | Default           |
| ------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| clientId     | string | Client application's identifier as registered with the Bentley IMS OIDC/OAuth2 provider.                                          | true     | none              |
| clientSecret | string | Client application's secret key as registered with the Bentley IMS OIDC/OAuth2 provider.                                          | true     | none              |
| scope        | string | List of space separated scopes to request access to various resources.                                                            | true     | none              |
| authority?   | string | The URL of the OIDC/OAuth2 provider. If left undefined, the iTwin Platform authority (`ims.bentley.com`) will be used by default. | false    | "ims.bentley.com" |

ServiceAuthorizationClient

| Name           | Type                    | Description                                                                                                                             |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| getAccessToken | () => Promise\<string\> | Returns the access token.                                                                                                               |
| hasExpired     | boolean                 | Returns true if the access token has expired.                                                                                           |
| hasSignedIn    | boolean                 | Returns true if signed in - the accessToken may be active or may have expired and require a refresh                                     |
| isAuthorized   | boolean                 | Returns true if there's a current authorized client Set to true if signed in and the access token has not expired, and false otherwise. |

*/

/**
 * @docs-group-description Authorization
 * Functionality for signing a user in and out of a service.
 */

/**
 * @docs-group-description Logging
 * Logger categories used by this package.
 */
