# @itwin/browser-authorization

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

## Description

The **@itwin/browser-authorization** package contains a browser based client for authorization with the iTwin platform.

## Documentation

For information about the browser authorization workflow please visit the [Authorization Overview Page](https://developer.bentley.com/apis/overview/authorization/#authorizingwebapplications).

## Running integration tests

- Ensure you've run `rush update` (or `rush install`) and `rush build`
- Install playwright binaries - `npx install playwright`
- Create an .env file based on .env.example - ask Arun G or Ben P for the values.
- `rush test:integration` will run integration tests for the entire repo.
- `rushx test:integration` runs the tests only in the Browser package.
- Playwright options are in playwright.config.ts (head-ful vs headless, timeouts, etc).
- The tests start the /test-app using parcel before running.
- To run only the test app: `rushx test:integration:start-test-app` and access localhost:1234 in your browser.
