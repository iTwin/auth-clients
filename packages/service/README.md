# @itwin/service-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/service-authorization** package contains a service based client for authorization with the iTwin platform using OIDC client credentials flow.

## Usage

```
const client = new ServiceAuthorizationClient(serviceConfiguration: ServiceAuthorizationClientConfiguration)
// retrieve a new access token
const token = await client.getAccessToken()
```

### ServiceAuthorizationClientConfiguration

| Property     | Type   | Description                                                                                                                       | Required | Default           |
| ------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| clientId     | string | Client application's identifier as registered with the Bentley IMS OIDC/OAuth2 provider.                                          | true     | none              |
| clientSecret | string | Client application's secret key as registered with the Bentley IMS OIDC/OAuth2 provider.                                          | true     | none              |
| scope        | string | List of space separated scopes to request access to various resources.                                                            | true     | none              |
| authority?   | string | The URL of the OIDC/OAuth2 provider. If left undefined, the iTwin Platform authority (`ims.bentley.com`) will be used by default. | false    | "ims.bentley.com" |

### ServiceAuthorizationClient

| Name           | Type                    | Description                                                                                                                             |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| getAccessToken | (additionalHeaders?: { [key: string]: string }) => Promise\<string\> | Returns the access token. The additional headers specified in the argument will be appended to any request sent to the authorization server. |
| hasExpired     | boolean                 | Returns true if the access token has expired.                                                                                           |
| hasSignedIn    | boolean                 | Returns true if signed in - the accessToken may be active or may have expired and require a refresh                                     |
| isAuthorized   | boolean                 | Returns true if there's a current authorized client Set to true if signed in and the access token has not expired, and false otherwise. |

For information about the service authorization workflow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizingservicemachinetomachine).

### IntrospectionClient

`IntrospectionClient` validates an access token locally with the issuer's JWKS. Always check `active` before you trust any other field of the response.

```ts
const client = new IntrospectionClient({ audience: "my-api" });
const response = await client.introspect(`Bearer ${accessToken}`);
if (!response.active)
  throw new Error("Invalid token");
```

| Property   | Type               | Description                                                                                                                                                          | Required | Default               |
| ---------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------- |
| issuerUrl? | string             | The URL of the OIDC/OAuth2 provider.                                                                                                                                 | false    | "ims.bentley.com"     |
| issuer?    | string \| string[] | If set, a token is active only when its `iss` claim exactly matches one of these values.                                                                               | false    | No issuer check       |
| audience?  | string \| string[] | If set, a token is active only when its `aud` claim contains one of these values. Set this, so that a token issued for another service is not accepted.              | false    | No audience check     |
