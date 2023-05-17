# @itwin/service-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/service-authorization** package contains a service based client for authorization with the iTwin platform using the OIDC client credentials flow.

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
| getAccessToken | () => Promise\<string\> | Returns the access token.                                                                                                               |
| hasExpired     | boolean                 | Returns true if the access token has expired.                                                                                           |
| hasSignedIn    | boolean                 | Returns true if signed in - the accessToken may be active or may have expired and require a refresh                                     |
| isAuthorized   | boolean                 | Returns true if there's a current authorized client Set to true if signed in and the access token has not expired, and false otherwise. |

For information about the service authorization workflow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizingservicemachinetomachine).
