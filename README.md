# iTwin.js Authorization clients

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.

[iTwin.js](http://www.itwinjs.org) is an open source platform for creating, querying, modifying, and displaying Infrastructure Digital Twins.

If you have questions, or wish to contribute to iTwin.js, see our [Contributing guide](https://github.com/iTwin/itwinjs-core/blob/master/CONTRIBUTING.md).

## About this Repository

This repository contains a few OAuth 2.0 client libraries to assist in authenticating with the iTwin Platform in TypeScript/JavaScript.

There are 3 clients in the repository, each of them corresponding to one of the application types supported by the iTwin Platform. See the [authorization documentation](https://developer.bentley.com/apis/overview/authorization/) for more details on the Authorization workflows supported.

- [Browser/SPA](./packages/browser/README.md)
- [Desktop/Electron](./packages/electron/README.md)
- [Service](./packages/service/README.md)

In addition, the [OIDC Signin Tool](./packages/oidc-signin-tool/README.md) is a test helper package to automate the sign-in workflow to aid writing integration tests.

There is also an [authorization client for command-line developer tools](./packages/node-cli/README.md).

## Prerequisites

- [Node](https://nodejs.org/en/): an installation of the latest security patch of Node 18. The Node installation also includes the **npm** package manager.
- [Rush](https://github.com/Microsoft/web-build-tools/wiki/Rush): to install `npm install -g @microsoft/rush`

## Build Instructions

1. Clone repository (first time) with `git clone` or pull updates to the repository (subsequent times) with `git pull`
2. Install dependencies: `rush update` or `rush install`
3. Build source: `rush build`
4. Run tests: `rush cover`

## Extract Documentation

`rush docs`
