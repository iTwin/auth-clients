# @itwin/service-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/service-authorization** package contains a service based client for authorization with the iTwin platform.

## Usage

Very simple to get up and running and grab an access token.

> Ensure you've added your service client email from your iTwin application to your iModel as a participant at developer.bentley.com and that your scopes match between app and app registration.

```typescript
const client = new ServiceAuthorizationClient({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  scope: process.env.SCOPE,
  authority: process.env.AUTHORITY,
});

const accessToken = await client.getAccessToken();
```

## Documentation

For information about the service authorization workflow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizingservicemachinetomachine).
